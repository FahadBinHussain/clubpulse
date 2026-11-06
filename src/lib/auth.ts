import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Adapter } from "next-auth/adapters";
import { Role } from "@prisma/client";
import { getSheetData } from "@/lib/googleSheets";

// Define the ranges for the sheets via environment variables
// const panelSheetRange = process.env.GOOGLE_SHEET_PANEL_MEMBERS_RANGE; // <-- REMOVED
const memberSheetRange = process.env.GOOGLE_SHEET_MEMBER_DATA_RANGE;
const panelAccessRolesRaw = process.env.PANEL_ACCESS_ROLES || "";
const panelRolesList = panelAccessRolesRaw.split(',').map(role => role.trim().toLowerCase()).filter(Boolean);

// Assuming indices based on COLUMN_INDICES in actions.ts
const MEMBER_EMAIL_COLUMN_INDEX = 1;
const MEMBER_ROLE_COLUMN_INDEX = 3; // Column D for Role

// Define and export authOptions here
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        console.log("profile callback triggered for:", profile.email);
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          role: Role.GUEST,
          specificRole: null,
        };
      },
    }),
  ],
  events: {
    async signIn({ user, isNewUser }) {
      console.log(`signIn event for user: ${user.email}. New user: ${isNewUser}`);
      if (!user.email) {
        console.error("User email is missing in signIn event.");
        return;
      }
      const userEmailLower = user.email.toLowerCase();
      let correctRole: Role = Role.GUEST; // Default to GUEST
      let specificRoleFromSheet: string | null = null; // Initialize specific role
      let roleSyncError: string | null = null; // Null = the sync worked

      try {
        // REMOVED: Logic for checking separate panel sheet range
        // let isPanel = false;
        // if (panelSheetRange) { ... }

        // Check member sheet for role
        if (!memberSheetRange) {
          roleSyncError =
            "GOOGLE_SHEET_MEMBER_DATA_RANGE is not set.";
          console.error(roleSyncError);
        } else {
          const memberData = await getSheetData(memberSheetRange);
          if (memberData === null) {
            roleSyncError = `Could not read the club activity sheet (${memberSheetRange}).`;
            console.error(roleSyncError);
          } else {
            let userFound = false;
            for (const row of memberData) {
              const sheetEmail = row && String(row[MEMBER_EMAIL_COLUMN_INDEX]).trim().toLowerCase();
              const sheetRoleRaw = row && String(row[MEMBER_ROLE_COLUMN_INDEX]).trim(); // Get raw role string
              const sheetRoleLower = sheetRoleRaw.toLowerCase();

              if (sheetEmail === userEmailLower) {
                userFound = true;
                specificRoleFromSheet = sheetRoleRaw; // Store the exact role string from the sheet

                if (panelRolesList.includes(sheetRoleLower)) {
                  correctRole = Role.PANEL;
                  console.log(`User ${user.email} found in member sheet with PANEL role: ${specificRoleFromSheet}.`);
                } else {
                  correctRole = Role.MEMBER;
                  console.log(`User ${user.email} found in member sheet with MEMBER role: ${specificRoleFromSheet}.`);
                }
                break; // Stop searching once user is found
              }
            }
            if (!userFound) {
               console.log(`User ${user.email} not found in member sheet, assigning GUEST role.`);
               // correctRole remains GUEST, specificRoleFromSheet remains null
            }
          }
        }

        // Update user role and specificRole in database
        console.log(`Final determined role: ${correctRole}, Specific Role: ${specificRoleFromSheet || 'None'}. Updating database...`);
        await prisma.user.update({
          where: { email: user.email },
          data: {
            role: correctRole,
            specificRole: specificRoleFromSheet, // Save the specific role string (or null)
            roleSyncError, // Persist the failure reason so the UI can surface it (null clears it)
          },
        });
        console.log(`Database roles updated for ${user.email}: Role=${correctRole}, SpecificRole=${specificRoleFromSheet || 'null'}`);

      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`Error during role sync in signIn event for ${user.email}:`, error);
        // Best effort: make the failure visible in the UI instead of silently degrading.
        try {
          await prisma.user.update({
            where: { email: user.email },
            data: { roleSyncError: `Role sync failed: ${reason}` },
          });
        } catch (persistError) {
          console.error(`Could not persist roleSyncError for ${user.email}:`, persistError);
        }
      }
    }
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
        session.user.specificRole = user.specificRole;
        session.user.roleSyncError = user.roleSyncError;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 

// Extend the default User and Session types for TypeScript
declare module 'next-auth' {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role; // Keep the broad role
      specificRole?: string | null; // Add the specific role
      roleSyncError?: string | null; // Set when the role sync failed (null = ok)
    };
  }

  interface User {
    role: Role; // Keep the broad role
    specificRole?: string | null; // Add the specific role
    roleSyncError?: string | null; // Set when the role sync failed (null = ok)
  }
} 