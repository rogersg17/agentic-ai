import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module.js';
import { projects } from '../database/schema.js';
import type { CreateProjectDto, UpdateProjectDto } from './dto/project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreateProjectDto) {
    const slug = dto.slug ?? this.slugify(dto.name);

    // Check slug uniqueness
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException(`Project with slug "${slug}" already exists`);
    }

    const [project] = await this.db
      .insert(projects)
      .values({
        name: dto.name,
        slug,
        description: dto.description ?? null,
      })
      .returning();

    return project;
  }

  async findAll() {
    return this.db.select().from(projects).orderBy(projects.created_at);
  }

  async findOne(id: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async findBySlug(slug: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);

    if (!project) {
      throw new NotFoundException(`Project with slug "${slug}" not found`);
    }
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const [project] = await this.db
      .update(projects)
      .set({
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        updated_at: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async remove(id: string) {
    const [project] = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning();

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return { deleted: true };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 255);
  }
}
