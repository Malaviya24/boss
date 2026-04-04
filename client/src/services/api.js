export async function fetchJson(path) {
  const response = await fetch(path, {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

export function fetchHomepage() {
  return fetchJson('/api/homepage');
}
