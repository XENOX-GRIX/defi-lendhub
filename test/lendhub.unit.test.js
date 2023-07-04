const { network, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("LendHub unit tests", function () {
          const amount = ethers.utils.parseEther("0.5");
          let lendHub, wethToken, user, wethTokenAddress, daiTokenAddress, daiToken, user2;
          beforeEach(async function () {
              const accounts = await ethers.getSigners(2);
              user = accounts[0];
              user2 = accounts[1];
              const chainId = network.config.chainId;
              const wethTokenContract = await ethers.getContractFactory("WETH");
              wethToken = await wethTokenContract.deploy();
              // prettier-ignore
              await wethToken.deployed({ "from": user });
              wethTokenAddress = wethToken.address;
              const daiTokenContract = await ethers.getContractFactory("DAI");
              daiToken = await daiTokenContract.deploy();
              // prettier-ignore
              await daiToken.deployed({ "from": user });
              daiTokenAddress = daiToken.address;
              // Interest rate contract deployment get the address
              const contract = await ethers.getContractFactory("LendHub");
              lendHub = await contract.deploy(
                  [wethTokenAddress, daiTokenAddress],
                  [
                      networkConfig[chainId]["ethUsdPriceFeed"],
                      networkConfig[chainId]["daiUsdPriceFeed"],
                  ],
                  networkConfig[chainId]["keepersUpdateInterval"]
                  //address of the interestRateModel
              );

              // prettier-ignore
              await lendHub.deployed({ "from": user });
          });
          describe("constructor", function () {
            it("intializes correctly", async function () {
                assert((await lendHub.getAllowedTokens()).length > 0);
            });
          });
          describe("supply", async function () {
              it("reverts if amount is zero", async function () {
                // prettier-ignore
                await wethToken.approve(lendHub.address, amount, {"from": user.address});
                await expect(lendHub.supply(wethTokenAddress, 0)).to.be.revertedWith(
                    "LendHub__NeedMoreThanZero"
                );
              });
              it("reverts if not approved", async function () {
                await expect(lendHub.supply(wethTokenAddress, amount)).to.be.reverted;
              });
              it("not allowed other wethTokens", async function () {
                const wethTokenAddress = "0xC297b516338A8e53A4C0063349266C8B0cfD07bF";
                await wethToken.approve(lendHub.address, amount);
                await expect(lendHub.supply(wethTokenAddress, amount)).to.be.revertedWith(
                    "LendHub__ThisTokenIsNotAvailable"
                );
              });
              it("add to total supply & supply balances", async function () {
                await wethToken.approve(lendHub.address, amount);
                await lendHub.supply(wethTokenAddress, amount);
                expect(await lendHub.getTokenTotalSupply(wethTokenAddress)).to.equal(amount);
                expect(await lendHub.getSupplyBalance(wethTokenAddress, user.address)).to.equal(
                    amount
                );
              });
              it("add suppliers & unique wethToken", async function () {
                  await wethToken.approve(lendHub.address, amount);
                  await lendHub.supply(wethTokenAddress, amount);
                  const suppliers = await lendHub.getSuppliers();
                  const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                  assert.equal(suppliers[0], user.address);
                  assert.equal(uniqueTokens[0], wethTokenAddress);
              });
              it("not adds suppliers & unique wethToken in array twice", async function () {
                  await wethToken.approve(lendHub.address, amount);
                  await lendHub.supply(wethTokenAddress, amount);
                  await wethToken.approve(lendHub.address, amount);
                  await lendHub.supply(wethTokenAddress, amount);
                  const suppliers = await lendHub.getSuppliers();
                  const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                  assert.equal(suppliers.length, 1);
                  assert.equal(uniqueTokens.length, 1);
              });
          });
          describe("withdraw", function () {
              //   let amount;
              beforeEach(async function () {
                  await wethToken.approve(lendHub.address, amount);
                  //   amount = ethers.utils.parseEther("0.5");
              });
              it("reverts if not supplied", async function () {
                  await expect(lendHub.withdraw(wethTokenAddress, amount)).to.be.revertedWith(
                      "LendHub__NotSupplied"
                  );
              });
              it("reverts if asking to withdraw more than supplied", async function () {
                  const moreAmount = ethers.utils.parseEther("0.6");
                  await lendHub.supply(wethTokenAddress, amount);
                  await expect(lendHub.withdraw(wethTokenAddress, moreAmount)).to.be.revertedWith(
                      "LendHub__CannotWithdrawMoreThanSupplied"
                  );
              });
              it("not withdraw full amount if u have borrowings", async function () {
                  await lendHub.supply(wethTokenAddress, amount);
                  const borrowAmount = ethers.utils.parseEther("0.1");
                  await lendHub.borrow(wethTokenAddress, borrowAmount);
                  await expect(lendHub.withdraw(wethTokenAddress, amount)).to.be.revertedWith(
                      "LendHub__NotAllowedBeforeRepayingExistingLoan"
                  );
              });
              it("removes supllier & unique token on 0 balance", async function () {
                  await lendHub.supply(wethTokenAddress, amount);
                  const withdrawAmount = ethers.utils.parseEther("0.5");
                  await lendHub.withdraw(wethTokenAddress, withdrawAmount);
                  const suppliers = await lendHub.getSuppliers();
                  const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                  assert(uniqueTokens.length === 0);
                  assert(suppliers.length === 0);
              });
              it("decreases total supply and supplier balance", async function () {
                  await lendHub.supply(wethTokenAddress, amount);
                  const withdrawAmount = ethers.utils.parseEther("0.3");
                  await lendHub.withdraw(wethTokenAddress, withdrawAmount);
                  expect(await lendHub.getTokenTotalSupply(wethTokenAddress)).to.equal(
                      ethers.utils.parseEther("0.2")
                  );
                  expect(await lendHub.getSupplyBalance(wethTokenAddress, user.address)).to.equal(
                      ethers.utils.parseEther("0.2")
                  );
              });
          });
          describe("borrow", async function () {
              let borrowAmount;
              beforeEach(async function () {
                  await wethToken.approve(lendHub.address, amount);
                  await lendHub.supply(wethTokenAddress, amount);
                  borrowAmount = ethers.utils.parseEther("0.3");
              });
              it("not allow more then 80 % to borrow", async function () {
                  await expect(
                      lendHub.borrow(wethTokenAddress, ethers.utils.parseEther("0.41"))
                  ).to.be.revertedWith("LendHub__CouldNotBorrowMoreThan80PercentOfCollateral");
              });
              it("not allows if tries to borrow again more", async function () {
                  await lendHub.borrow(wethTokenAddress, ethers.utils.parseEther("0.40"));
                  await expect(
                      lendHub.borrow(wethTokenAddress, ethers.utils.parseEther("0.01"))
                  ).to.be.revertedWith("LendHub__CouldNotBorrowMoreThan80PercentOfCollateral");
              });
              it("adds borrower and unique token", async function () {
                  await lendHub.borrow(wethTokenAddress, borrowAmount);
                  const borrowers = await lendHub.getBorrowers();
                  const uniqueTokens = await lendHub.getUniqueBorrowerTokens(user.address);
                  assert.equal(borrowers[0], user.address);
                  assert.equal(uniqueTokens[0], wethTokenAddress);
              });
              it("decreses from total supply and increases borrower balance", async function () {
                  await lendHub.borrow(wethTokenAddress, borrowAmount);
                  const totalSupply = await lendHub.getTokenTotalSupply(wethTokenAddress);
                  const borrowBalance = await lendHub.getBorrowedBalance(
                      wethTokenAddress,
                      user.address
                  );
                  expect(totalSupply).to.equal(amount.sub(borrowAmount));
                  expect(borrowBalance).to.equal(borrowAmount);
              });
          });
          describe("repay", async function () {
              let borrowAmount, repayAmount;
              beforeEach(async function () {
                  await wethToken.approve(lendHub.address, amount);
                  await lendHub.supply(wethTokenAddress, amount);
                  borrowAmount = ethers.utils.parseEther("0.3");
                  await lendHub.borrow(wethTokenAddress, borrowAmount);
              });
              it("adds balance in total supply and decreses from borrowed", async function () {
                  repayAmount = ethers.utils.parseEther("0.2");
                  await wethToken.approve(lendHub.address, repayAmount);
                  await lendHub.repay(wethTokenAddress, repayAmount);
                  const totalSupply = await lendHub.getTokenTotalSupply(wethTokenAddress);
                  const borrowBalance = await lendHub.getBorrowedBalance(
                      wethTokenAddress,
                      user.address
                  );
                  expect(totalSupply).to.equal(repayAmount.add(amount.sub(borrowAmount)));
                  expect(borrowBalance).to.equal(borrowAmount.sub(repayAmount));
              });
              it("remove borrower and uniqure token if balance is 0", async function () {
                  repayAmount = ethers.utils.parseEther("0.3");
                  await wethToken.approve(lendHub.address, repayAmount);
                  await lendHub.repay(wethTokenAddress, repayAmount);
                  const borrowers = await lendHub.getBorrowers();
                  const uniqueTokens = await lendHub.getUniqueBorrowerTokens(user.address);
                  assert(borrowers.length === 0);
                  assert(uniqueTokens.length === 0);
              });
          });
          describe("check upKeep", async function () {
              let interval;
              beforeEach(async function () {
                  interval = await lendHub.getInterval();
                  await wethToken.approve(lendHub.address, amount);
              });
              it("returns false if has no users", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lendHub.callStatic.checkUpkeep([]);
                  assert(!upkeepNeeded);
              });
              it("returns false if interval is NOT passed", async function () {
                  await lendHub.supply(wethTokenAddress, amount);
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lendHub.callStatic.checkUpkeep([]);
                  assert(!upkeepNeeded);
              });
              it("returns true if interval is passed", async function () {
                  await lendHub.supply(wethTokenAddress, amount);
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
                  const { upkeepNeeded } = await lendHub.callStatic.checkUpkeep([]);
                  assert(upkeepNeeded);
              });
          });
          describe("perform upkeep", async function () {
              let borrowAmount, supplyAmount, interval;
              beforeEach(async function () {
                  interval = await lendHub.getInterval();
                  supplyAmount = ethers.utils.parseEther("1000");
                  await wethToken.approve(lendHub.address, supplyAmount);
                  await lendHub.supply(wethTokenAddress, supplyAmount);
                  borrowAmount = ethers.utils.parseEther("100");
                  await lendHub.borrow(wethTokenAddress, borrowAmount);
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.send("evm_mine", []);
              });


              //***  * before testing next 3, change the returnm value of checkUpkeep to always
        //       it("charges dynamic interest per 30 sec", async function () {
        //         const beforeBorrowBalance = await lendHub.getBorrowedBalance(
        //             wethTokenAddress,
        //             user.address
        //         );
        //         await lendHub.performUpkeep([]);
        //         const afterBorrowBalance = await lendHub.getBorrowedBalance(
        //             wethTokenAddress,
        //             user.address
        //         );
        //         console.log("Before Borrow Balance:", beforeBorrowBalance.toString());
        //         console.log("After Borrow Balance:", afterBorrowBalance.toString());
        //     });
        //     it("reward dynamic interest per 30 sec", async function () {
        //         const beforeSupplyBalance = await lendHub.getSupplyBalance(
        //             wethTokenAddress,
        //             user.address
        //         );
        //         await lendHub.performUpkeep([]);
        //         const afterSupplyBalance = await lendHub.getSupplyBalance(
        //             wethTokenAddress,
        //             user.address
        //         );
                
        //         console.log("Before Supply Balance:", beforeSupplyBalance.toString());
        //         console.log("After Supply Balance:", afterSupplyBalance.toString());
        //     });
        //     it("reward dynamic interest per 30 sec for 3 period", async function () {
        //       const beforeSupplyBalance = await lendHub.getSupplyBalance(
        //           wethTokenAddress,
        //           user.address
        //       );
        //       await lendHub.getSupplyBalance(wethTokenAddress,
        //           user.address
        //       );
        //       await lendHub.getSupplyBalance(wethTokenAddress,
        //           user.address
        //       );
        //       await lendHub.getSupplyBalance(wethTokenAddress,
        //           user.address
        //       );
        //       await lendHub.performUpkeep([]);
        //       const afterSupplyBalance = await lendHub.getSupplyBalance(
        //           wethTokenAddress,
        //           user.address
        //       );
              
        //       console.log("Before Supply Balance:", beforeSupplyBalance.toString());
        //       console.log("After Supply Balance:", afterSupplyBalance.toString());
        //   });



        //   describe("Liquidate", async function (){
        //     let amountSupply , amountBorrow; 
        //     beforeEach(async function () {
        //         amountSupply = ethers.utils.parseEther("0.5");
        //         amountBorrow = ethers.utils.parseEther("0.4");
        //     });
        //     it("check if supplies/collateral reaches zero after crossing liquidation threshold", async function () {
        //         await lendHub.supply(wethTokenAddress, amountSupply);
        //         await lendHub.borrow(wethTokenAddress, amountBorrow);
        //         let supplies = await lendHub.getTotalSupplyValue(wethTokenAddress);
        //         console.log("************************", supplies); 
        //         await lendHub.reducesupply(wethTokenAddress); 
        //         supplies = await lendHub.getTotalSupplyValue(wethTokenAddress);
        //         console.log("************************", supplies); 

        //         await lendHub.performUpkeep([]);
        //         supplies = await lendHub.getUserTotalCollateral(wethTokenAddress);
        //         console.log("************************", supplies);
        //     }); 
        });

          // I tested this after switching OFF `notMoreThanMaxBorrow()` function, otherwise it will not work.

          // describe("liquidation", function () {
          //     beforeEach(async function () {
          //         await wethToken.approve(lendHub.address, amount);
          //         await lendHub.supply(wethTokenAddress, amount);
          //         await lendHub.borrow(wethTokenAddress, amount);
          //     });
          //     it("only owner can call it", async function () {
          //         lendHub = lendHub.connect(user2);
          //         await expect(lendHub.liquidation()).to.be.revertedWith(
          //             "Ownable: caller is not the owner"
          //         );
          //     });
          //     it("owner can liquidate collaterals if borrowing is more than supply", async function () {
          //         await lendHub.liquidation();
          //         const borrowBlnc = await lendHub.getBorrowedBalance(
          //             wethTokenAddress,
          //             user.address
          //         );
          //         const supplyBlnc = await lendHub.getSupplyBalance(wethTokenAddress, user.address);
          //         assert(borrowBlnc == 0);
          //         assert(supplyBlnc == 0);
          //     });
          // });
      });