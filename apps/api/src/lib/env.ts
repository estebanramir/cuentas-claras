function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Ver .env.example.`);
  return value;
}

export const env = {
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  get googleWebClientId() {
    return required('GOOGLE_WEB_CLIENT_ID');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },
};
