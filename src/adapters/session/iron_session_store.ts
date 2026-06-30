import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import type { SessionOptions } from "iron-session";
import type {
  ConnectionSession,
  ConnectionSessionPort,
} from "@/domain/session/ports";
import type { S3Connection } from "@/domain/s3/models";
import { getSessionSecret } from "@/infrastructure/config";

const COOKIE_NAME = "s3m_session";

/** Shape persisted inside the sealed cookie. */
interface SessionData {
  connection?: S3Connection;
  createdAt?: string;
  lastUsedAt?: string;
}

function sessionOptions(): SessionOptions {
  return {
    password: getSessionSecret(),
    cookieName: COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

/**
 * Stores the active connection in an encrypted (sealed) cookie.
 *
 * The secret never reaches browser-readable storage: the cookie is `httpOnly`
 * and sealed with `SESSION_SECRET`, so only the server can decrypt it.
 */
export class IronSessionStore implements ConnectionSessionPort {
  private async read() {
    return getIronSession<SessionData>(await cookies(), sessionOptions());
  }

  async getConnection(): Promise<S3Connection | undefined> {
    const session = await this.read();
    return session.connection;
  }

  async getSession(): Promise<ConnectionSession | undefined> {
    const session = await this.read();
    if (!session.connection) {
      return undefined;
    }
    const now = new Date();
    return {
      connection: session.connection,
      createdAt: session.createdAt ? new Date(session.createdAt) : now,
      lastUsedAt: session.lastUsedAt ? new Date(session.lastUsedAt) : now,
    };
  }

  async save(connection: S3Connection): Promise<void> {
    const session = await this.read();
    const nowIso = new Date().toISOString();
    session.connection = connection;
    session.createdAt = session.createdAt ?? nowIso;
    session.lastUsedAt = nowIso;
    await session.save();
  }

  async clear(): Promise<void> {
    const session = await this.read();
    session.destroy();
  }
}
