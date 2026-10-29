import type { FastifyRequest } from 'fastify';
export const ip = (req: FastifyRequest): string => req.ip;
export const clientKey = (req: FastifyRequest): string => req.principal?.id ?? req.ip;
