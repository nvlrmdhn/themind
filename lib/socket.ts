"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "https://themind-production-779d699d.up.railway.app";

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      tryAllTransports: true,
    });
  }
  return socket;
}
