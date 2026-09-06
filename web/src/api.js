const API_URL = import.meta.env.VITE_API_URL || "http://localhost:10000";

export async function apiFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error: ${res.status} ${res.statusText} - ${text}`);
  }

  return res.json();
}
