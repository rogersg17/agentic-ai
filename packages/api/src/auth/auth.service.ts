import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Role } from '@agentic/shared';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  [key: string]: unknown;
}

@Injectable()
export class AuthService {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const connectionString = this.configService.get<string>(
      'postgres.connectionString',
      'postgres://agentic:agentic_dev@localhost:5432/agentic_platform',
    );
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }

  async register(dto: RegisterDto) {
    // Check for existing user
    const existing = await this.db.execute<UserRow>(
      sql`SELECT id FROM users WHERE email = ${dto.email} LIMIT 1`,
    );
    if (existing.length > 0) {
      throw new ConflictException('A user with this email already exists');
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash, role, created_at)
      VALUES (${id}, ${dto.name}, ${dto.email}, ${passwordHash}, ${dto.role}, NOW())
    `);

    const token = this.signToken(id, dto.email, dto.role);
    return { access_token: token, userId: id };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    const token = this.signToken(user.id, user.email, user.role as Role);
    return { access_token: token, userId: user.id };
  }

  async validateUser(email: string, password: string): Promise<UserRow> {
    const rows = await this.db.execute<UserRow>(
      sql`SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ${email} LIMIT 1`,
    );
    if (rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = rows[0]!;
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async getProfile(userId: string) {
    const rows = await this.db.execute<UserRow>(
      sql`SELECT id, name, email, role, created_at FROM users WHERE id = ${userId} LIMIT 1`,
    );
    if (rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const user = rows[0]!;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
    };
  }

  private signToken(userId: string, email: string, role: Role): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }
}
