import { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma"; // Import the prisma client instance
import { Adapter } from "next-auth/adapters"; // Import Adapter type
import { Role } from "@prisma/client"; // <-- Import Role enum
import { getSheetData } from "@/lib/googleSheets"; // <-- Import sheet data function

// Define the range for the Panel Members sheet via environment variable
const panelSheetRange = process.env.GOOGLE_SHEET_PANEL_MEMBERS_RANGE;
// const PANEL_SHEET_RANGE = 'PanelMembers!B2:B'; // <-- Removed hardcoded value

const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("signIn callback triggered for user:", user.email);
      if (!user.email) {
        console.error("User email not available during signIn.");
        return false; // Prevent sign-in if email is missing
      }

      try {
        // Check if the panel range is configured
        if (!panelSheetRange) {
          console.error("GOOGLE_SHEET_PANEL_MEMBERS_RANGE environment variable is not set.");
          // Fail open: allow login as MEMBER, but log the error.
          return true; 
        }

        // Fetch panel member emails from Google Sheet
        const panelData = await getSheetData(panelSheetRange); // <-- Use env var here
        
        if (panelData === null) {
          console.error("Failed to fetch panel member data from Google Sheet.");
          // Decide policy: fail open (allow login as MEMBER) or fail closed (deny login)?
          // For now, let's fail open but log the error.
          return true; // Allow login but role won't be elevated
        }

        const panelEmails = panelData.flat().map(email => String(email).trim().toLowerCase());
        console.log("Panel emails fetched:", panelEmails);

        const isPanelMember = panelEmails.includes(user.email.toLowerCase());
        console.log(`User ${user.email} is panel member: ${isPanelMember}`);

        if (isPanelMember) {
          // Update user role in the database if they are a panel member
          await prisma.user.update({
            where: { email: user.email },
            data: { role: Role.PANEL },
          });
          console.log(`Updated role to PANEL for user: ${user.email}`);
        } else {
           // Optional: Ensure non-panel members are explicitly MEMBER
           // This might be redundant if the default is MEMBER, but ensures consistency
           await prisma.user.update({
             where: { email: user.email },
             data: { role: Role.MEMBER }, // Ensure role is MEMBER
           });
           console.log(`Ensured role is MEMBER for user: ${user.email}`);
        }

        return true; // Allow sign-in
      } catch (error) {
        console.error("Error during signIn callback (role check):", error);
        // Decide policy on error: fail open or closed?
        return false; // Prevent sign-in on unexpected error during role check
      }
    },

    // Session callback remains the same, it reads the role set by signIn/adapter
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role; // Role comes from the DB user object
      }
      return session;
    },
  },
  // Add other configurations here if needed (e.g., secret, pages)
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 