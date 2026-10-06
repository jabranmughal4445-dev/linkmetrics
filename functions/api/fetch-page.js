function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();

  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    h.startsWith("172.16.") ||
    h.startsWith("172.17.") ||
    h.startsWith("172.18.") ||
    h.startsWith("172.19.") ||
    h.startsWith("172.20.") ||
    h.startsWith("172.21.") ||
    h.startsWith("172.22.") ||
    h.startsWith("172.23.") ||
    h.startsWith("172.24.") ||
    h.startsWith("172.25.") ||
    h.startsWith("172.26.") ||
    h.startsWith("172.27.") ||
    h.startsWith("172.28.") ||
    h.startsWith("172.29.") ||
    h.startsWith("172.30.") ||
    h.startsWith("172.31.")
  );
}

async function fetchPage(urlString) {
  let current = new URL(urlString);

  for (let hop = 0; hop <= 3; hop++) {
    if (!["http:", "https:"].includes(current.protocol)) {
      throw new Error("Only HTTP and HTTPS URLs are supported");
    }

    if (isBlockedHost(current.hostname)) {
      throw new Error("Private host blocked");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let response;

    try {
      response = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "LinkMetrics/1.0 (+public-page-analysis)",
          "Accept": "text/html,application/xhtml+xml,text/plain,*/*"
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === 3) {
        throw new Error("Too many redirects");
      }

      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Redirect without destination");
      }

      current = new URL(location, current.href);
      continue;
    }

    if (!response.ok) {
      throw new Error("Target returned HTTP " + response.status);
    }

    const contentType =
      (response.headers.get("content-type") || "").toLowerCase();

    if (contentType && !/html|xml|text\//.test(contentType)) {
      throw new Error("Target did not return HTML");
    }

    const contentLength = Number(
      response.headers.get("content-length") || 0
    );

    if (contentLength > 5000000) {
      throw new Error("Page is larger than 5 MB");
    }

    const html = await response.text();

    if (!html.trim()) {
      throw new Error("Empty page");
    }

    return {
      html: html.slice(0, 3000000),
      finalUrl: current.href
    };
  }

  throw new Error("Could not fetch page");
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const rawUrl = requestUrl.searchParams.get("url");

  if (!rawUrl) {
    return Response.json(
      {
        kind: "http",
        message: "Missing URL"
      },
      { status: 400 }
    );
  }

  let targetUrl;

  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return Response.json(
      {
        kind: "http",
        message: "Invalid URL"
      },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    return Response.json(
      {
        kind: "http",
        message: "Only HTTP and HTTPS URLs are supported"
      },
      { status: 400 }
    );
  }

  try {
    const result = await fetchPage(targetUrl.href);

    return Response.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error && error.name === "AbortError"
        ? "The target website took too long to respond."
        : error?.message || "Could not fetch the target website.";

    return Response.json(
      {
        kind: "blocked",
        status: 502,
        message
      },
      { status: 502 }
    );
  }
}
