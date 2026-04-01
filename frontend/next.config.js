/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empty turbopack config — silences the "no turbopack config" warning in Next.js 16.
  // MediaPipe WASM files are loaded at runtime from the CDN (via `locateFile`) so no
  // special bundler configuration is required.
  turbopack: {},
};

module.exports = nextConfig;
