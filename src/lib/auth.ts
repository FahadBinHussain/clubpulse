import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { Adapter } from "next-auth/adapters";
import { Role } from "@prisma/client";
import { getSheetData } from "@/lib/googleSheets";

// Define the ranges for the sheets via environment variables
const panelSheetRange = process.env.GOOGLE_SHEET_PANEL_MEMBERS_RANGE;
const memberSheetRange = process.env.GOOGLE_SHEET_MEMBER_DATA_RANGE;
// Assuming email is the second column (index 1) in the member sheet based on COLUMN_INDICES in actions.ts
const MEMBER_EMAIL_COLUMN_INDEX = 1;

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
          role: Role.GUEST
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
      let correctRole: Role = Role.GUEST;

      try {
        let isPanel = false;
        if (panelSheetRange) {
          const panelData = await getSheetData(panelSheetRange);
          if (panelData) {
            const panelEmails = panelData.flat().map(e => String(e).trim().toLowerCase());
            if (panelEmails.includes(userEmailLower)) {
              correctRole = Role.PANEL;
              isPanel = true;
              console.log(`User ${user.email} is a PANEL member.`);
            }
          } else {
            console.error("Failed to fetch panel data during signIn event.");
          }
        } else {
          console.warn("Panel sheet range not configured. Cannot check for PANEL role.");
        }

        if (!isPanel && memberSheetRange) {
          const memberData = await getSheetData(memberSheetRange);
          if (memberData) {
            const memberEmails = memberData
              .map(row => row && String(row[MEMBER_EMAIL_COLUMN_INDEX]).trim().toLowerCase())
              .filter(email => email);
            if (memberEmails.includes(userEmailLower)) {
              correctRole = Role.MEMBER;
              console.log(`User ${user.email} is a MEMBER.`);
            } else {
              console.log(`User ${user.email} is not found in member sheet, remaining GUEST.`);
            }
          } else {
            console.error("Failed to fetch member data during signIn event.");
          }
        } else if (!isPanel) {
          console.warn("Member sheet range not configured. Cannot check for MEMBER role.");
        }

        console.log(`Final determined role: ${correctRole}. Updating database...`);
        await prisma.user.update({
          where: { email: user.email },
          data: { role: correctRole },
        });
        console.log(`Database role updated to ${correctRole} for ${user.email}`);

      } catch (error) {
        console.error(`Error during role sync in signIn event for ${user.email}:`, error);
      }
    }
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 