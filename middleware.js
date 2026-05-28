import { next } from '@vercel/edge';

export default async function middleware(request) {
  const response = await next();
  const contentType = response.headers.get('content-type') || '';
  
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const modified = html.replace('</body>', '<script src="/gate.js"></script></body>');

  return new Response(modified, {
    status: response.status,
    headers: response.headers,
  });
}

export const config = {
  matcher: '/lessons/:path*',
};
