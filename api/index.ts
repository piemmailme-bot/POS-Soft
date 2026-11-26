import { createApiApp } from '../src/server/createApiApp.ts';

const app = createApiApp({
  enableDailyBackupTimer: false,
  includeApi404: true,
});

export default app;
