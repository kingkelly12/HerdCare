import { File, Paths } from 'expo-file-system';

interface AgentSession {
  code: string;
  apiKey: string;
  name?: string;
}

interface AdminSession {
  token: string;
}

const AGENT_FILE_NAME = 'agent_session.json';
const ADMIN_FILE_NAME = 'admin_session.json';

export async function getStoredAgentSession(): Promise<AgentSession | null> {
  try {
    const file = new File(Paths.document, AGENT_FILE_NAME);
    if (!file.exists) return null;
    const content = file.textSync();
    return JSON.parse(content) as AgentSession;
  } catch {
    return null;
  }
}

export async function saveAgentSession(session: AgentSession): Promise<void> {
  try {
    const file = new File(Paths.document, AGENT_FILE_NAME);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to save agent session', err);
  }
}

export async function clearAgentSession(): Promise<void> {
  try {
    const file = new File(Paths.document, AGENT_FILE_NAME);
    if (file.exists) file.delete();
  } catch {}
}

export async function getStoredAdminSession(): Promise<AdminSession | null> {
  try {
    const file = new File(Paths.document, ADMIN_FILE_NAME);
    if (!file.exists) return null;
    const content = file.textSync();
    return JSON.parse(content) as AdminSession;
  } catch {
    return null;
  }
}

export async function saveAdminSession(session: AdminSession): Promise<void> {
  try {
    const file = new File(Paths.document, ADMIN_FILE_NAME);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to save admin session', err);
  }
}

export async function clearAdminSession(): Promise<void> {
  try {
    const file = new File(Paths.document, ADMIN_FILE_NAME);
    if (file.exists) file.delete();
  } catch {}
}
