import { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma"; // Import the prisma client instance
import { Adapter } from "next-auth/adapters"; // Import Adapter type
import { Role } from "@prisma/client"; // <-- Import Role enum
import { getSheetData } from "@/lib/googleSheets"; // <-- Import sheet data function

// Define the ranges for the sheets via environment variables
const panelSheetRange = process.env.GOOGLE_SHEET_PANEL_MEMBERS_RANGE;
const memberSheetRange = process.env.GOOGLE_SHEET_MEMBER_DATA_RANGE;
// Assuming email is the second column (index 1) in the member sheet based on COLUMN_INDICES in actions.ts
const MEMBER_EMAIL_COLUMN_INDEX = 1; 

// Export the authOptions constant
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Profile callback: Returns standard info. Adapter handles creation with default role (GUEST).
      profile(profile) {
        console.log("profile callback triggered for:", profile.email);
        // Provide the full User structure, including a default role.
        // The actual role sync happens in events.signIn.
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          role: Role.GUEST // Provide default role for adapter compatibility
        };
      },
    }),
  ],
  events: {
    // Event fires AFTER successful sign-in and adapter user creation/linking
    async signIn({ user, isNewUser }) {
      console.log(`signIn event for user: ${user.email}. New user: ${isNewUser}`);

      if (!user.email) {
        console.error("User email is missing in signIn event.");
        return; // Stop processing if no email
      }
      const userEmailLower = user.email.toLowerCase();
      // Keep explicit type annotation in case linter is sensitive
      let correctRole: Role = Role.GUEST; 

      try {
        // 1. Check Panel Sheet
        let isPanel = false;
        if (!panelSheetRange) {
          console.warn("Panel sheet range not configured. Cannot check for PANEL role.");
        } else {
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
        }

        // 2. If not Panel, check Member Sheet
        if (!isPanel) {
           if (!memberSheetRange) {
               console.warn("Member sheet range not configured. Cannot check for MEMBER role.");
           } else {
               const memberData = await getSheetData(memberSheetRange);
               if (memberData) {
                   const memberEmails = memberData
                       .map(row => row && String(row[MEMBER_EMAIL_COLUMN_INDEX]).trim().toLowerCase())
                       .filter(email => email);
                   if (memberEmails.includes(userEmailLower)) {
                       correctRole = Role.MEMBER;
                       console.log(`User ${user.email} is a MEMBER.`);
                   } else {
                        // Explicitly log if user is not found in member sheet either
                        console.log(`User ${user.email} is not found in member sheet, remaining GUEST.`);
                   }
               } else {
                  console.error("Failed to fetch member data during signIn event.");
               }
           }
        }

        // 3. Update DB Role
        // Always update the role in the DB on sign in to ensure it's synchronized with sheets.
         console.log(`Final determined role: ${correctRole}. Updating database...`);
         await prisma.user.update({
             where: { email: user.email }, // Use email which is unique
             data: { role: correctRole },
         });
         console.log(`Database role updated to ${correctRole} for ${user.email}`);

      } catch (error) {
        console.error(`Error during role sync in signIn event for ${user.email}:`, error);
      }
    }
  },
  callbacks: {
    // Session callback needs to read the potentially updated user role
    async session({ session, user }) {
      // The 'user' object here comes from the database *after* the update in events.signIn
       if (session.user) {
         session.user.id = user.id;
         session.user.role = user.role; // Role reflects the latest DB value
       }
       return session;
    },
  },
  // Add other configurations here if needed (e.g., secret, pages)
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 