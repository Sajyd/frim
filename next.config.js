/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: [
      '@aws-sdk/client-s3',
      '@aws-sdk/client-sqs',
      '@aws-sdk/client-ec2',
      '@aws-sdk/client-cloudwatch',
      '@aws-sdk/s3-request-presigner',
      '@aws-sdk/client-budgets',
      '@aws-sdk/client-sts',
      '@aws-sdk/client-secrets-manager',
      '@vercel/oidc-aws-credentials-provider',
      'resend',
    ],
  },
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  },
}

module.exports = nextConfig
