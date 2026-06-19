function parseDatabaseUrl(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '5432', 10),
      username: u.username,
      password: u.password,
      name: u.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

export default () => {
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  return {
    database: parsed || {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      name: process.env.DB_NAME,
    },
  };
};