// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {XAgentPayEscrow} from "../src/XAgentPayEscrow.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title Deploy
 * @notice Deploys XAgentPayEscrow behind a UUPS proxy to PlatON devnet.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   FEE_RECIPIENT=0x...
 *   XAGENT_OPERATOR=0x...
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url platon_devnet \
 *     --broadcast \
 *     --verify
 */
contract Deploy is Script {
    // PlatON devnet USDC
    address constant USDC = 0xFF8dEe9983768D0399673014cf77826896F97e4d;

    // Defaults
    uint256 constant RELEASE_TIMEOUT = 86_400;   // 24 hours
    uint256 constant DISPUTE_WINDOW  = 259_200;  // 72 hours
    uint16  constant FEE_BPS         = 30;       // 0.3%

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address xagentOperator = vm.envAddress("XAGENT_OPERATOR");

        vm.startBroadcast(deployerPk);

        // 1. Deploy implementation
        XAgentPayEscrow impl = new XAgentPayEscrow();

        // 2. Encode initialize() calldata
        bytes memory initData = abi.encodeCall(
            XAgentPayEscrow.initialize,
            (USDC, RELEASE_TIMEOUT, DISPUTE_WINDOW, FEE_BPS, feeRecipient, xagentOperator)
        );

        // 3. Deploy ERC1967Proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        console.log("Proxy (stable address):", address(proxy));
        console.log("Implementation:", address(impl));
        console.log("  USDC:", USDC);
        console.log("  feeRecipient:", feeRecipient);
        console.log("  xagentOperator:", xagentOperator);
        console.log("  feeBps:", FEE_BPS);

        vm.stopBroadcast();
    }
}
