// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.7;

// All the error Codes 
error LendHub__NeedMoreThanZero(uint256 amount);
error LendHub__NotSupplied();
error LendHub__CannotWithdrawMoreThanSupplied(uint256 amount);
error LendHub__CouldNotBorrowMoreThan80PercentOfCollateral();
error LendHub__ThisTokenIsNotAvailable(address tokenAddress);
error LendHub__NotAllowedBeforeRepayingExistingLoan(uint256 amount);
error LendHub__TransactionFailed();
error LendHub__SorryWeCurrentlyDoNotHaveThisToken(address tokenAddress);
error LendHub__UpKeepNotNeeded();
error InvalidLiquidation();
error BorrowerIsSolvant();
error TransferFailed();

contract LendHub is ReentrancyGuard, AutomationCompatibleInterface, Ownable {

    //store all the allowed token address
    address[] private LH_tokens_allowed;

    // store the list of supplier address
    address[] private LH_suppliers;

    // store the list of borrower address
    address[] private LH_borrowers;

    // stores the minimum time interval after which operations such as liquidation and interest rate charges are performed
    uint256 private immutable i_interval;

    // stores the last time stamp when operations such as liquidation and interest rate charges were performed
    uint256 private LH_lastTimeStamp;
    
    // Define the threshold after which liquidation takes place 
    uint256 public constant LIQUIDATION_THRESHOLD = 80; // 80% --> if the supplied token of the user

    // Min health factor is used along with liquidation to help in liquidation process determination
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    
    // This is used to determine interest rate to a precision of 1e5 
    uint256 public Precision = 10e5; 

    struct Pool {
        uint256 amount;
        uint256 interestrate;
        uint256 timestamp;
        uint256 timespan;
        uint64 ratePerSec;
        uint64 optimalUtilization;
        uint64 baseRate;
        uint64 slope1;
        uint64 slope2;
    }

    event TokenSupplied(
        address indexed tokenAddress,
        address indexed userAddress,
        uint256 indexed amount
    );
    event TokenWithdrawn(
        address indexed tokenAddress,
        address indexed userAddress,
        uint256 indexed amount
    );
    event TokenBorrowed(
        address indexed tokenAddress,
        address indexed userAddress,
        uint256 indexed amount
    );
    event TokenRepaid(
        address indexed tokenAddress,
        address indexed userAddress,
        uint256 indexed amount
    );
    event Liquidated(address user, address liquidator);

    // tokenAddress -> structPool
    mapping(address => Pool) private LH_SupplyPool;

    // tokenAddress & user address -> their supplied balances
    mapping(address => mapping(address => uint256)) private LH_token_User_SupplyBalance;

    // tokenAddress & user adddress -> their borrowed balance
    mapping(address => mapping(address => uint256)) private LH_token_User_BorrowBalance;

    // token address -> price feeds
    mapping(address => AggregatorV3Interface) private LH_tokenPrices;

    // userAddress -> all of his unique supplied tokens
    mapping(address => address[]) private LH_supplierTokens;

    // userAddress -> all of his unique borrowed tokens
    mapping(address => address[]) private LH_borrowerTokens;

    modifier hasSupplied() {
        bool success;
        for (uint256 i = 0; i < LH_tokens_allowed.length; i++) {
            if (LH_token_User_SupplyBalance[LH_tokens_allowed[i]][msg.sender] > 0) {
                success = true;
            }
        }

        if (!success) {
            revert LendHub__NotSupplied();
        }
        _;
    }

    modifier notZero(uint256 amount) {
        if (amount <= 0) {
            revert LendHub__NeedMoreThanZero(amount);
        }
        _;
    }

    modifier isTokenAllowed(address tokenAddress) {
        bool execute;
        for (uint256 i = 0; i < LH_tokens_allowed.length; i++) {
            if (LH_tokens_allowed[i] == tokenAddress) {
                execute = true;
            }
        }
        if (!execute) {
            revert LendHub__ThisTokenIsNotAvailable(tokenAddress);
        }
        _;
    }

    //************************************  Main  contract functions start here 

    Pool public pool = Pool({
        amount: 0,
        interestrate:1 ,
        timestamp:0 ,
        timespan:0 ,
        ratePerSec:0 ,
        optimalUtilization: 80000 ,
        baseRate: 1 ,
        slope1: 30000,
        slope2: 95000
    });

    constructor(
        address[] memory allowedTokens,
        address[] memory priceFeeds,
        uint256 updateInterval
    ) {
        LH_tokens_allowed = allowedTokens;

        for (uint256 i = 0; i < allowedTokens.length; i++) {
            LH_tokenPrices[allowedTokens[i]] = AggregatorV3Interface(priceFeeds[i]);
            LH_SupplyPool[allowedTokens[i]] = pool;
        }
        i_interval = updateInterval;
        LH_lastTimeStamp = block.timestamp;
    }

    function supply(
        address tokenAddress,
        uint256 amount
    ) external payable isTokenAllowed(tokenAddress) notZero(amount) nonReentrant {
        bool success = IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        if (!success) {
            revert LendHub__TransactionFailed();
        }
        LH_SupplyPool[tokenAddress].amount += amount;
        LH_token_User_SupplyBalance[tokenAddress][msg.sender] += amount;
        addSupplier(msg.sender);
        addUniqueToken(LH_supplierTokens[msg.sender], tokenAddress);
        emit TokenSupplied(tokenAddress, msg.sender, amount);
    }

    function withdraw(
        address tokenAddress,
        uint256 amount
    ) external payable hasSupplied notZero(amount) nonReentrant {
        if (amount > LH_token_User_SupplyBalance[tokenAddress][msg.sender]) {
            revert LendHub__CannotWithdrawMoreThanSupplied(amount);
        }

        revertIfHighBorrowing(tokenAddress, msg.sender, amount);
        LH_token_User_SupplyBalance[tokenAddress][msg.sender] -= amount;
        LH_SupplyPool[tokenAddress].amount -= amount;
        removeSupplierAndUniqueToken(tokenAddress, msg.sender);
        IERC20(tokenAddress).transfer(msg.sender, amount);
        emit TokenWithdrawn(tokenAddress, msg.sender, amount);
    }

    function borrow(
        address tokenAddress,
        uint256 amount
    ) external payable isTokenAllowed(tokenAddress) hasSupplied notZero(amount) nonReentrant {
        if (LH_SupplyPool[tokenAddress].amount <= 0) {
            revert LendHub__SorryWeCurrentlyDoNotHaveThisToken(tokenAddress);
        }
        notMoreThanMaxBorrow(tokenAddress, msg.sender, amount);
        addBorrower(msg.sender);
        addUniqueToken(LH_borrowerTokens[msg.sender], tokenAddress);
        LH_token_User_BorrowBalance[tokenAddress][msg.sender] += amount;
        LH_SupplyPool[tokenAddress].amount -= amount;
        IERC20(tokenAddress).transfer(msg.sender, amount);
        emit TokenBorrowed(tokenAddress, msg.sender, amount);
    }

    function repay(
        address tokenAddress,
        uint256 amount
    ) external payable notZero(amount) nonReentrant {
        bool success = IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        if (!success) {
            revert LendHub__TransactionFailed();
        }
        LH_token_User_BorrowBalance[tokenAddress][msg.sender] -= amount;
        LH_SupplyPool[tokenAddress].amount += amount;
        if (LH_token_User_BorrowBalance[tokenAddress][msg.sender] == 0) removeBorrowerAndUniqueToken(tokenAddress, msg.sender);
        emit TokenRepaid(tokenAddress, msg.sender, amount);
    }


    function checkUpkeep(
        bytes memory 
    ) public view override returns (bool upkeepNeeded, bytes memory) {

        bool hasUsers = (LH_borrowers.length > 0) || (LH_suppliers.length > 0);
        bool isTimePassed = (block.timestamp - LH_lastTimeStamp) > i_interval;
        upkeepNeeded = (hasUsers && isTimePassed);
        return (upkeepNeeded, "0x0");
    }

    function performUpkeep(bytes calldata ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");

        if (!upkeepNeeded) {
            revert LendHub__UpKeepNotNeeded();
        }
        for (uint i = 0; i < LH_tokens_allowed.length; i++) {
            _calculateInterestRate(LH_tokens_allowed[i]);
            uint256 _newRate = LH_SupplyPool[LH_tokens_allowed[i]].interestrate;
            for (uint256 j = 0; j < LH_borrowers.length; j++) {
                uint256 interest = (LH_token_User_BorrowBalance[LH_tokens_allowed[i]][
                    LH_borrowers[j]
                ] *
                     
                    _newRate) / (Precision*1e18);
                LH_token_User_BorrowBalance[LH_tokens_allowed[i]][LH_borrowers[j]] += interest;
                //TODO
                // LH_SupplyPool[LH_tokens_allowed[i]].borrow +=interest;
            }
            for (uint256 j = 0; j < LH_suppliers.length; j++) {
                uint256 interest = (LH_token_User_SupplyBalance[LH_tokens_allowed[i]][
                    LH_suppliers[j]
                ] *
                     
                    _newRate) / (Precision*1e18);
                LH_token_User_SupplyBalance[LH_tokens_allowed[i]][LH_suppliers[j]] += interest;
                // LH_SupplyPool[LH_tokens_allowed[i]].amount -=interest;
            }
        }

        // liquidate
        for (uint256 j = 0; j < LH_borrowers.length; j++) {
            if (healthFactor(LH_borrowers[j]) < MIN_HEALTH_FACTOR) {
                for (uint256 index = 0; index < LH_tokens_allowed.length; index++) {
                    LH_token_User_BorrowBalance[LH_tokens_allowed[index]][LH_borrowers[j]] = 0;
                    LH_token_User_SupplyBalance[LH_tokens_allowed[index]][LH_borrowers[j]] = 0;
                }
            }
        }

        LH_lastTimeStamp = block.timestamp;
    }

    function calculateInterestRate(
        Pool memory poolInfo,
        uint256 totalAssetAmount,
        uint256 totalBorrowAmount
    ) internal view returns(uint256){
        uint256 utilization = (Precision * totalBorrowAmount) /
            totalAssetAmount;
        uint256 optimalUtilization = poolInfo.optimalUtilization;
        uint256 baseRate = poolInfo.baseRate; 
        uint256 slope1 = poolInfo.slope1;
        uint256 slope2 = poolInfo.slope2;
        uint256 newRate;
        if (utilization <= optimalUtilization) {
            newRate = uint64( baseRate * Precision + ((utilization * slope1)/optimalUtilization));
        } 
        else{
            newRate = uint256(baseRate * Precision + ((slope1 + (utilization - optimalUtilization) * slope2) /  (Precision - optimalUtilization)));
        }
        return newRate;
    }

    function _calculateInterestRate(address token) internal {
        if (LH_SupplyPool[token].amount == 0) {
            return;
        } else if (LH_SupplyPool[token].timestamp == block.timestamp) {
            return;
        }
        else {
            uint256 _deltaTime = block.timestamp - LH_SupplyPool[token].timestamp;
            LH_SupplyPool[token].timespan = _deltaTime;

            uint256 _newRate = calculateInterestRate(
                LH_SupplyPool[token],
                this.getTokenTotalSupply(token),
                this.getTokenTotalBorrow(token)
            );

            LH_SupplyPool[token].interestrate = _newRate;
            LH_SupplyPool[token].timestamp = uint64(block.timestamp);
        }
    }

    function faucet(address tokenAddress) external {
        IERC20(tokenAddress).transfer(msg.sender, 10000 * 10 ** 18);
    }

    // Helper functions ////

    function revertIfHighBorrowing(
        address tokenAddress,
        address userAddress,
        uint256 amount
    ) private view {
        uint256 availableAmountValue = getTotalSupplyValue(userAddress) -
            ((uint256(100) * getTotalBorrowValue(userAddress)) / uint256(80));

        (uint256 price, uint256 decimals) = getLatestPrice(tokenAddress);
        uint256 askedAmountValue = amount * (price / 10 ** decimals);

        if (askedAmountValue > availableAmountValue) {
            revert LendHub__NotAllowedBeforeRepayingExistingLoan(amount);
        }
    }

    function notMoreThanMaxBorrow(
        address tokenAddress,
        address userAddress,
        uint256 amount
    ) private view {
        uint256 maxBorrow = getMaxBorrow(userAddress);
        (uint256 price, uint256 decimals) = getLatestPrice(tokenAddress);
        uint256 askedAmountValue = amount * (price / 10 ** decimals);

        if (askedAmountValue > maxBorrow) {
            revert LendHub__CouldNotBorrowMoreThan80PercentOfCollateral();
        }
    }

    function addUniqueToken(address[] storage uniqueTokenArray, address tokenAddress) private {
        if (uniqueTokenArray.length == 0) {
            uniqueTokenArray.push(tokenAddress);
        } else {
            bool add = true;
            for (uint256 i = 0; i < uniqueTokenArray.length; i++) {
                if (uniqueTokenArray[i] == tokenAddress) {
                    add = false;
                }
            }
            if (add) {
                uniqueTokenArray.push(tokenAddress);
            }
        }
    }

    function addSupplier(address userAddress) private {
        if (LH_suppliers.length == 0) {
            LH_suppliers.push(userAddress);
        } else {
            bool add = true;
            for (uint256 i = 0; i < LH_suppliers.length; i++) {
                if (LH_suppliers[i] == userAddress) {
                    add = false;
                }
            }
            if (add) {
                LH_suppliers.push(userAddress);
            }
        }
    }

    function addBorrower(address userAddress) private {
        if (LH_borrowers.length == 0) {
            LH_borrowers.push(userAddress);
        } else {
            bool add = true;
            for (uint256 i = 0; i < LH_borrowers.length; i++) {
                if (LH_borrowers[i] == userAddress) {
                    add = false;
                }
            }
            if (add) {
                LH_borrowers.push(userAddress);
            }
        }
    }

    function removeSupplierAndUniqueToken(address tokenAddress, address userAddress) private {
        if (LH_token_User_SupplyBalance[tokenAddress][userAddress] <= 0) {
            remove(LH_supplierTokens[userAddress], tokenAddress);
        }

        if (LH_supplierTokens[userAddress].length == 0) {
            remove(LH_suppliers, userAddress);
        }
    }

    function removeBorrowerAndUniqueToken(address tokenAddress, address userAddress) private {
        if (LH_token_User_BorrowBalance[tokenAddress][userAddress] <= 0) {
            remove(LH_borrowerTokens[userAddress], tokenAddress);
        }
        if (LH_borrowerTokens[userAddress].length == 0) {
            remove(LH_borrowers, userAddress);
        }
    }

    function remove(address[] storage array, address removingAddress) private {
        for (uint256 i = 0; i < array.length; i++) {
            if (array[i] == removingAddress) {
                array[i] = array[array.length - 1];
                array.pop();
            }
        }
    }

    ///   getter functions   ///

    function getTokenTotalSupply(address tokenAddress) external view returns (uint256) {
        return LH_SupplyPool[tokenAddress].amount;
    }
    
    function getTokenTotalBorrow(address tokenAddress) external view returns (uint256) {
        uint256 total = 0; 
        for(uint64 i = 0; i< LH_borrowers.length; i++){
            total += LH_token_User_BorrowBalance[tokenAddress][LH_borrowers[i]]; 
        }
        return total;
    }

    function getAllTokenSupplyInUsd() external view returns (uint256) {
        uint256 totalValue = 0;
        for (uint256 i = 0; i < LH_tokens_allowed.length; i++) {
            (uint256 price, uint256 decimals) = getLatestPrice(LH_tokens_allowed[i]);

            totalValue += ((price / 10 ** decimals) * LH_SupplyPool[LH_tokens_allowed[i]].amount);
        }
        return totalValue;
    }

    function getSupplyBalance(
        address tokenAddress,
        address userAddress
    ) external view returns (uint256) {
        return LH_token_User_SupplyBalance[tokenAddress][userAddress];
    }

    function getBorrowedBalance(
        address tokenAddress,
        address userAddress
    ) external view returns (uint256) {
        return LH_token_User_BorrowBalance[tokenAddress][userAddress];
    }

    function getLatestPrice(address tokenAddress) public view returns (uint256, uint256) {
        (, int256 price, , , ) = LH_tokenPrices[tokenAddress].latestRoundData();
        uint256 decimals = uint256(LH_tokenPrices[tokenAddress].decimals());
        return (uint256(price), decimals);
    }

    function getMaxBorrow(address userAddress) public view returns (uint256) {
        uint256 availableAmountValue = getTotalSupplyValue(userAddress) -
            ((uint256(100) * getTotalBorrowValue(userAddress)) / uint256(80));

        return (availableAmountValue * uint256(80)) / uint256(100);
    }

    function getMaxWithdraw(
        address tokenAddress,
        address userAddress
    ) external view returns (uint256) {
        uint256 availableAmount = LH_token_User_SupplyBalance[tokenAddress][userAddress] -
            ((uint256(100) * LH_token_User_BorrowBalance[tokenAddress][userAddress]) /
                uint256(80));

        return availableAmount;
    }

    function getMaxTokenBorrow(
        address tokenAddress,
        address userAddress
    ) external view returns (uint256) {
        uint256 availableAmountValue = getTotalSupplyValue(userAddress) - 
            ((uint256(100) * getTotalBorrowValue(userAddress)) / uint256(80));

        (uint256 price, uint256 decimals) = getLatestPrice(tokenAddress);
        return ((availableAmountValue / (price / 10 ** decimals)) * uint256(80)) / uint256(100);
    }

    function getTotalSupplyValue(address userAddress) public view returns (uint256) {
        uint256 totalValue = 0;
        for (uint256 i = 0; i < LH_tokens_allowed.length; i++) {
            (uint256 price, uint256 decimals) = getLatestPrice(LH_tokens_allowed[i]);

            totalValue += ((price / 10 ** decimals) *
                LH_token_User_SupplyBalance[LH_tokens_allowed[i]][userAddress]);
        }
        return totalValue;
    }

    function getTotalBorrowValue(address userAddress) public view returns (uint256) {
        uint256 totalValue = 0;
        for (uint256 i = 0; i < LH_tokens_allowed.length; i++) {
            (uint256 price, uint256 decimals) = getLatestPrice(LH_tokens_allowed[i]);
            totalValue += ((price / 10 ** decimals) *
                LH_token_User_BorrowBalance[LH_tokens_allowed[i]][userAddress]);
        }
        return totalValue;
    }

    function getAllowedTokens() external view returns (address[] memory) {
        return LH_tokens_allowed;
    }

    function getSuppliers() external view returns (address[] memory) {
        return LH_suppliers;
    }

    function getBorrowers() external view returns (address[] memory) {
        return LH_borrowers;
    }

    function getUserTotalCollateral(address user) public view returns (uint256 totalInDai) {
        uint256 len = LH_tokens_allowed.length;
        for (uint256 i; i < len; ) {
            address token = LH_tokens_allowed[i];

            uint256 tokenAmount = LH_token_User_SupplyBalance[token][user];

            if (tokenAmount != 0) {
                totalInDai += getTokenPrice(token) * tokenAmount;
            }

            unchecked {
                ++i;
            }
        }
    }

    function getUserTotalBorrow(address user) public view returns (uint256 totalInDai) {
        uint256 len = LH_tokens_allowed.length;
        for (uint256 i; i < len; ) {
            address token = LH_tokens_allowed[i];

            uint256 tokenAmount = LH_token_User_BorrowBalance[token][user];
            if (tokenAmount != 0) {
                totalInDai += getTokenPrice(token) * tokenAmount;
            }

            unchecked {
                ++i;
            }
        }
    }

    function getUserTokenCollateralAndBorrow(
        address user,
        address token
    ) external view returns (uint256 tokenCollateralAmount, uint256 tokenBorrowAmount) {
        tokenCollateralAmount = LH_token_User_SupplyBalance[token][user];
        tokenBorrowAmount = LH_token_User_BorrowBalance[token][user];
    }

    function healthFactor(address user) public view returns (uint256 factor) {
        uint256 totalCollateralAmount = getUserTotalCollateral(user);
        uint256 totalBorrowAmount = getUserTotalBorrow(user);

        if (totalBorrowAmount == 0) return  2 * MIN_HEALTH_FACTOR;

        uint256 collateralAmountWithThreshold = (totalCollateralAmount * LIQUIDATION_THRESHOLD) / 100;
        factor = (collateralAmountWithThreshold * MIN_HEALTH_FACTOR) / totalBorrowAmount;
    }

    function getTokenPrice(address token) public view returns (uint256) {
        AggregatorV3Interface priceFeed = LH_tokenPrices[token];
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint256 decimals = priceFeed.decimals();
        return uint256(price) / 10 ** decimals;
    }

    function getUniqueSupplierTokens(
        address userAddress
    ) external view returns (address[] memory) {
        return LH_supplierTokens[userAddress];
    }

    function getUniqueBorrowerTokens(
        address userAddress
    ) external view returns (address[] memory) {
        return LH_borrowerTokens[userAddress];
    }

    function getInterval() external view returns (uint256) {
        return i_interval;
    }

    function getInterestRate(address token) external view returns (uint256) {
        return LH_SupplyPool[token].interestrate;
    }
}
