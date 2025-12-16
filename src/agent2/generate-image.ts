import 'dotenv/config';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
const token = process.env.CLOUDFLARE_API_TOKEN!;

export async function generateImage(prompt: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt }),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to generate image: ${res.status} ${res}`);
  }

  const data = await res.json();

  return data.result.image;
}