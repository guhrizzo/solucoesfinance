/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // vlibras.gov.br serve o próprio widget via jsDelivr (repositório
              // público spbgovbr-vlibras/vlibras-portal), por isso os dois hosts.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.firebaseapp.com https://*.googleapis.com https://*.gstatic.com https://apis.google.com https://vlibras.gov.br https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.googleusercontent.com https://*.googleapis.com https://vlibras.gov.br https://cdn.jsdelivr.net",
              "media-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebasestorage.app https://vlibras.gov.br https://cdn.jsdelivr.net",
              "connect-src 'self' blob: https://*.firebaseio.com https://*.googleapis.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com wss://*.firebaseio.com https://vlibras.gov.br https://cdn.jsdelivr.net",
              "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://vlibras.gov.br",
              "worker-src 'self' blob: https://vlibras.gov.br https://cdn.jsdelivr.net",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
