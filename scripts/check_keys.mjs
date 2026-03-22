import { privateKeyToAccount } from "viem/accounts";

// Load private keys from environment variables — never hardcode keys here.
// Usage: FLIGHT_KEY=0x... HOTEL_KEY=0x... node scripts/check_keys.mjs
const flightKey = process.env.FLIGHT_KEY;
const hotelKey = process.env.HOTEL_KEY;

if (!flightKey || !hotelKey) {
  console.error("Error: Set FLIGHT_KEY and HOTEL_KEY environment variables");
  process.exit(1);
}

const flightAccount = privateKeyToAccount(flightKey);
const hotelAccount = privateKeyToAccount(hotelKey);

console.log("Flight Address:", flightAccount.address);
console.log("Hotel Address:", hotelAccount.address);
