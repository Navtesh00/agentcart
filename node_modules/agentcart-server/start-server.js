import { default as app, initDB } from './src/index.js';

await initDB();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`AgentCart server listening http://localhost:${PORT}`));