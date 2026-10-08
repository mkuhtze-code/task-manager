/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/app',
  webpack: (config) => {
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['@'] = process.cwd();
    return config;
  },
};

export default nextConfig;
