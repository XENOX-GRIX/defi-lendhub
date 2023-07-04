const networkConfig = {
    default: {
        name: "hardhat",
        keepersUpdateInterval: "30",
        tokenAddresses: [
            "0x8455471D6d4B2B260c5f31ec461A167Aa7CD1319",
            "0x231F96A75e9769eF0724BdCb2e65B4E5DF778da3",
            "0x96F0541be50739C24C7B163e49ad20661dbfA17b",
            "0xf3b0BF046a4CF537f8BCFD385ea6ec21d8Da02Fa",
            "0x2bd8A9Bd0eA5e7893E5B09692F5a6d499D4E4319",
        ],
        btcUsdPriceFeed: "0x007A22900a3B98143368Bd5906f8E17e9867581b",
        ethUsdPriceFeed: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
        daiUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        usdcUsdPriceFeed: "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0",
        lendhubUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        keepersUpdateInterval: "30",
    },
    5777: {
        name: "localhost",
        tokenAddresses: [
            "0x049856981Fc63219c426fcFA88d214Bf21b67a0E",
            "0xd4ac619a9A98e25eB6c049a48f3e279dA06eC913",
            "0xceD3C86fC2EAeaDc8062197B651e757e10af43D5",
            "0xcF28B34984E0AAB55443a11fc0dF095C4492c69E",
            "0x5B183d403fB41208C5E90eb33903361a78641C7C",
        ],
        btcUsdPriceFeed: "0x007A22900a3B98143368Bd5906f8E17e9867581b",
        ethUsdPriceFeed: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
        daiUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        usdcUsdPriceFeed: "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0",
        lendhubUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        keepersUpdateInterval: "30",
    },
    31337: {
        name: "localhost",
        tokenAddresses: [
            "0x049856981Fc63219c426fcFA88d214Bf21b67a0E",
            "0xd4ac619a9A98e25eB6c049a48f3e279dA06eC913",
            "0xceD3C86fC2EAeaDc8062197B651e757e10af43D5",
            "0xcF28B34984E0AAB55443a11fc0dF095C4492c69E",
            "0x5B183d403fB41208C5E90eb33903361a78641C7C",
        ],
        btcUsdPriceFeed: "0x007A22900a3B98143368Bd5906f8E17e9867581b",
        ethUsdPriceFeed: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
        daiUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        usdcUsdPriceFeed: "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0",
        lendhubUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        keepersUpdateInterval: "30",
    },
    80001: {
        name: "mumbai",
        gasPrice: "10000000007",
        gasLimit: "50000000000",
        tokenAddresses: [
            "0x049856981Fc63219c426fcFA88d214Bf21b67a0E",
            "0xd4ac619a9A98e25eB6c049a48f3e279dA06eC913",
            "0xceD3C86fC2EAeaDc8062197B651e757e10af43D5",
            "0xcF28B34984E0AAB55443a11fc0dF095C4492c69E",
            "0x5B183d403fB41208C5E90eb33903361a78641C7C",
        ],
        btcUsdPriceFeed: "0x007A22900a3B98143368Bd5906f8E17e9867581b",
        ethUsdPriceFeed: "0x0715A7794a1dc8e42615F059dD6e406A6594651A",
        daiUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        usdcUsdPriceFeed: "0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0",
        lendhubUsdPriceFeed: "0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046",
        keepersUpdateInterval: "30",
    },
};

const developmentChains = ["hardhat", "localhost"];
const VERIFICATION_BLOCK_CONFIRMATIONS = 50;
const iWethContractAddress = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";

module.exports = {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    iWethContractAddress,
};
