import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth"; // <-- Import from lib

// Keep only the handler definition
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 