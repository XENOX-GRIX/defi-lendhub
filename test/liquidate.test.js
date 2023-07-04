// To run this test, remove the line 
// notMoreThanMaxBorrow(tokenAddress, msg.sender, amount);
// inside the borrow function in main contract 

const { network, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("LendHub unit tests", function () {
          let lendHub, wethToken, user, wethTokenAddress, daiTokenAddress, daiToken, user2, x;
          beforeEach(async function () {
            const accounts = await ethers.getSigners(2);
            user = accounts[0];
            user2 = accounts[1];
            const chainId = network.config.chainId;

            // Weth 
            const wethTokenContract = await ethers.getContractFactory("WETH");
            wethToken = await wethTokenContract.deploy();
            await wethToken.deployed({ "from": user });
            wethTokenAddress = wethToken.address;

            //dai
            const daiTokenContract = await ethers.getContractFactory("DAI");
            daiToken = await daiTokenContract.deploy();
            await daiToken.deployed({ "from": user });
            daiTokenAddress = daiToken.address;

            const contract = await ethers.getContractFactory("LendHub");
            lendHub = await contract.deploy(
                [wethTokenAddress, daiTokenAddress],
                [
                    networkConfig[chainId]["ethUsdPriceFeed"],
                    networkConfig[chainId]["daiUsdPriceFeed"],
                ],
                networkConfig[chainId]["keepersUpdateInterval"]
            );
            await lendHub.deployed({ "from": user });
          });
          describe("liquidation", function () {
                let amount, borrow, interval; 
                beforeEach(async function () {
                    amount = ethers.utils.parseEther("5");
                    borrow = ethers.utils.parseEther("4.5");
                    interval = await lendHub.getInterval();
                    await wethToken.approve(lendHub.address, amount);
                    await lendHub.supply(wethTokenAddress, amount);
                    await lendHub.borrow(wethTokenAddress, borrow);
                });
                it("Liquidation occurs if borrowing is more than supply, i.e healthfactor of owner is less than minimum health factor", async function () {
                    var borrowBalnc = await lendHub.getBorrowedBalance(wethTokenAddress,user.address);
                    var suppliedBalnc = await lendHub.getSupplyBalance(wethTokenAddress,user.address);
                    console.log("User Borrowed Balance before liquidation : ", borrowBalnc.toString()); 
                    console.log("User Supplied Collateral before liquidation : ", suppliedBalnc.toString());
                    console.log("Borrowed balance has become more than 80% of the user collateral ****** ") 
                    await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                    await lendHub.performUpkeep([]);
                    borrowBalnc = await lendHub.getBorrowedBalance(wethTokenAddress,user.address);
                    suppliedBalnc = await lendHub.getSupplyBalance(wethTokenAddress,user.address);
                    console.log("User Borrowed Balance after liquidation : ", borrowBalnc.toString());
                    console.log("User Supplied Collateral after liquidation : ", suppliedBalnc.toString());
                    assert(borrowBalnc == 0);
                    assert(suppliedBalnc == 0);
                });
            });
      });
