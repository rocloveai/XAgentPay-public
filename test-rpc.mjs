import { createPublicClient, http, erc20Abi } from "viem";
async function check(url) {
  const publicClient = createPublicClient({ transport: http(url) });
  try {
    const bal = await publicClient.readContract({
      address: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: ["0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1"]
    });
    console.log(url, "->", bal);
  } catch(e) { console.error(url, "Error:", e.message); }
}
await check("https://devnetopenapi.platon.network/rpc");
await check("https://devnetopenapi2.platon.network/rpc");
