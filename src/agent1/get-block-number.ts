export async function getBlockNumber() {
  const body = {
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1
  };

  const res = await fetch('https://eth.llamarpc.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`HTTP error: ${res.status}`);
  }

  const json = await res.json();
  const hex = json.result;
  const decimal = parseInt(hex, 16);

  return { hex, decimal };
}
