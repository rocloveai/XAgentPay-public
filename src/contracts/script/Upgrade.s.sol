// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NexusPayEscrow} from "../src/NexusPayEscrow.sol";

/**
 * @title Upgrade
 * @notice Upgrades NexusPayEscrow proxy to a new implementation.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x...
 *   PROXY_ADDRESS=0x...
 *   forge script script/Upgrade.s.sol:Upgrade \
 *     --rpc-url platon_devnet \
 *     --broadcast
 */
contract Upgrade is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAddr = vm.envAddress("PROXY_ADDRESS");

        vm.startBroadcast(deployerPk);

        // 1. Deploy new implementation
        NexusPayEscrow newImpl = new NexusPayEscrow();

        // 2. Upgrade proxy to new implementation
        NexusPayEscrow proxy = NexusPayEscrow(proxyAddr);
        proxy.upgradeToAndCall(address(newImpl), "");

        console.log("Proxy:", proxyAddr);
        console.log("New implementation:", address(newImpl));
        console.log("Version:", proxy.VERSION());

        vm.stopBroadcast();
    }
}
