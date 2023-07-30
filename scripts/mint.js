const { ethers } = require('ethers');
const { EthersAdapter } = require('@safe-global/protocol-kit');
const ProtocolKit = require('@safe-global/protocol-kit');
const Safe = ProtocolKit.default;
const ApiKit = require('@safe-global/api-kit');
const SafeApiKit = ApiKit.default;
const fs = require("fs").promises;

require('dotenv').config();

// Safe related contract addresses on Darwinia Network, detail: 
// https://github.com/furoxr/safe-deployments/tree/support-darwinia/src/assets/v1.3.0
const contractNetworks = {
    [46]: {
        safeMasterCopyAddress: '0x25f9F86fFc0a12805708A71a08b1d6C75eAFc7E7',
        safeProxyFactoryAddress: '0x023753AEE29350a7c718955e98D3f55A2B4E81E8',
        multiSendAddress: '0x02197D00f48545a73ae2cF20361E2fA6C0dA8352',
        multiSendCallOnlyAddress: '0x8deEdA4C3F6a426af8aF2aA7f9046b81Dc7B203E',
        fallbackHandlerAddress: '0xf8BD414B5b6167255054bf1B782612dC290A9Eb0',
        signMessageLibAddress: '0x655DCcB1DfF9B3A239E2E63a6E345ae575151620',
        createCallAddress: '0x51Fe48E8C27756c4daE21388290FE622881bFD7E',
        simulateTxAccessorAddress: '0x5d04699256052Ba151553a3b2f402DCDd8CD042d',
    }
};

const checkEnv = function () {
    console.log(process.env)
    envs = [
        'RPC_URL', 'TX_URL', 'SAFE_WALLET_ADDRESS',
        'NFT_ADDRESS', 'APPLICANTS_PATH', 'ABI_PATH', 
        'OWNER_PRIVATE_KEY', 'METADATA_PATH'
    ];
    envs.forEach(env => {
        if (!process.env[env]) {
            throw new Error("env " + env + " is empty");
        }
    })
}

const loadApplicants = async function () {
    const content = await fs.readFile(process.env.APPLICANTS_PATH, 'utf8');
    const lines = content.trim().split('\n');
    const applicants = lines.map(line => line.split(','));
    console.log(applicants);
    if (applicants.length == 0) {
        throw new Error("No applicants found!")
    }
    return applicants;
}

const loadMetadata = async function () {
    const content = await fs.readFile(process.env.METADATA_PATH, 'utf8');
    const lines = content.trim().split('\n');
    const metadataUri = lines[1].split(' ')[1];
    if (!metadataUri) {
        throw new Error("No metadata uri found!")
    }
    console.log(metadataUri);
    return metadataUri;
}

const start = async function () {
    checkEnv();
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const owner = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: owner
    });

    // Load applicants from release.md
    const applicants = await loadApplicants();

    // Transactions: Mint NFT to applicants
    const abi = JSON.parse(await fs.readFile(process.env.ABI_PATH, 'utf8'));
    const interface = new ethers.utils.Interface(abi);
    const safeTransactionData = applicants.map(applicant => {
        const [to, uri] = applicant;
        const data = interface.encodeFunctionData("safeMint", [to, uri]);
        return {
            to: process.env.NFT_ADDRESS,
            value: "0",
            data
        }
    });

    // Load metadata uri from release_ipfs.md
    const metadataUri = await loadMetadata();
    const setBaseUriData = interface.encodeFunctionData("setBaseURI", [metadataUri]);
    safeTransactionData.push({
        to: process.env.NFT_ADDRESS,
        value: "0",
        data: setBaseUriData
    });

    // Create safe transaction
    const safeAddress = process.env.SAFE_WALLET_ADDRESS;
    const safeSdk = await Safe.create({ ethAdapter, safeAddress, contractNetworks });
    const safeTransaction = await safeSdk.createTransaction({ safeTransactionData });
    const safeTxHash = await safeSdk.getTransactionHash(safeTransaction)
    const senderSignature = await safeSdk.signTransactionHash(safeTxHash)
    const proposeTransactionProps = {
        safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: await owner.getAddress(),
        senderSignature: senderSignature.data,
    };
    console.log(safeTxHash);

    // Propose transaction to Safe Transaction service
    const txServiceUrl = process.env.TX_URL;
    const safeService = new SafeApiKit({ txServiceUrl, ethAdapter: ethAdapter });
    await safeService.proposeTransaction(proposeTransactionProps);
}

checkEnv();
// loadMetadata();
// loadApplicants();
// start();
