export async function getCryptoPrice(tokens: string) {
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&symbols=${tokens}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch price: ${res.status}`);
    }

    const data = await res.json();
    return data;
}