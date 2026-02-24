import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
const publicClient = createPublicClient({ transport: http("https://devnetopenapi2.platon.network/rpc") });
try {
  const bal = await publicClient.readContract({
    address: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: ["0xA1c26b5F706B1A8c6AC997d8cce4A826BaaCa9D1"]
  });
  console.log("Balance:", bal);
} catch (e) {
  console.error("Error:", e);
}
