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
              const wethTokenContract = await ethers.getContractFactory("WETH");
              wethToken = await wethTokenContract.deploy();
              await wethToken.deployed({ "from": user });
              wethTokenAddress = wethToken.address;
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
          describe("Interest Checks  ", async function () {
              it("Interest rates when high supply, less borrow of tokens (low demand)", async function () {
                const amount = ethers.utils.parseEther("5");
                const borrowAmount = ethers.utils.parseEther("1");
                interval = await lendHub.getInterval();
                await wethToken.approve(lendHub.address, amount);
                await lendHub.supply(wethTokenAddress, amount);
                await lendHub.borrow(wethTokenAddress, borrowAmount);
                console.log("Total Supplies of the token before upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token before upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await lendHub.performUpkeep([]);
                x = (await lendHub.getInterestRate(wethTokenAddress)).toString(); 
                console.log("Total Supplies of the token after upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token after upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                var num = Number(x);   
                num = num / 100000;   
                x = num.toString();  
                console.log("Interest Rate  ********* : ", x);
                console.log("*******************************************************************************");
                const suppliers = await lendHub.getSuppliers();
                const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                assert.equal(suppliers.length, 1);
                assert.equal(uniqueTokens.length, 1);
              });
              it("Interest rates when high borrow (during high demand)", async function () {
                const amount = ethers.utils.parseEther("5");
                const borrowAmount = ethers.utils.parseEther("4");
                interval = await lendHub.getInterval();
                await wethToken.approve(lendHub.address, amount);
                await lendHub.supply(wethTokenAddress, amount);
                await lendHub.borrow(wethTokenAddress, borrowAmount);
                console.log("Total Supplies of the token before upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token before upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await lendHub.performUpkeep([]);
                x = (await lendHub.getInterestRate(wethTokenAddress)).toString(); 
                console.log("Total Supplies of the token after upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token after upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                var num = Number(x);   
                num = num / 100000;   
                x = num.toString();  
                console.log("Interest Rate  ********* : ", x);
                console.log("*******************************************************************************");
                const suppliers = await lendHub.getSuppliers();
                const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                assert.equal(suppliers.length, 1);
                assert.equal(uniqueTokens.length, 1);
              });
              it("Interest rates during average conditions", async function () {
                const amount = ethers.utils.parseEther("5");
                const borrowAmount = ethers.utils.parseEther("3");
                interval = await lendHub.getInterval();
                await wethToken.approve(lendHub.address, amount);
                await lendHub.supply(wethTokenAddress, amount);
                await lendHub.borrow(wethTokenAddress, borrowAmount);
                console.log("Total Supplies of the token before upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token before upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await lendHub.performUpkeep([]);
                x = (await lendHub.getInterestRate(wethTokenAddress)).toString(); 
                console.log("Total Supplies of the token after upkeep : ", (await lendHub.getTokenTotalSupply(wethTokenAddress)).toString());
                console.log("Total Borrows  of the token after upkeep : ", (await lendHub.getTokenTotalBorrow(wethTokenAddress)).toString());
                var num = Number(x);   
                num = num / 100000;   
                x = num.toString();  
                console.log("Interest Rate  ********* : ", x);
                const suppliers = await lendHub.getSuppliers();
                const uniqueTokens = await lendHub.getUniqueSupplierTokens(user.address);
                assert.equal(suppliers.length, 1);
                assert.equal(uniqueTokens.length, 1);
              });
          });
      });
