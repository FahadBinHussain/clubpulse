import { DefaultSession, DefaultUser } from "next-auth";
import { Role } from "@prisma/client"; // Import the Role enum from generated Prisma client

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user?: {
      id: string;
      role: Role; // Add the role property
    } & DefaultSession["user"];
  }

  /**
   * The shape of the user object returned in the OAuth providers `profile` function,
   * or the second parameter of the `session` callback, when using a database.
   */
  interface User extends DefaultUser {
    role: Role; // Add the role property
  }
}

// If using JWTs, you might need to augment the JWT type as well:
declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    /** OpenID ID Token */
    idToken?: string;
    userId: string;
    role: Role;
  }
} 