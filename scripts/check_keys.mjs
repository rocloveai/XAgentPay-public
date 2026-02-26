import { privateKeyToAccount } from "viem/accounts";

const flightKey = "0x3be84b4fa995ef7d87918aea8b0b1ad0cb88d66161b569c3fb55c8125cc31ba7";
const hotelKey = "0xf39368a8751c244304bc1c69c55c9bab82a811cf471b3f7fe17451efd563c997";

const flightAccount = privateKeyToAccount(flightKey);
const hotelAccount = privateKeyToAccount(hotelKey);

console.log("Flight Address:", flightAccount.address);
console.log("Hotel Address:", hotelAccount.address);
