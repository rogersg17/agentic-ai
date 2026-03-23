import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../auth/rbac.guard.js';
import { RequireCapability } from '../auth/rbac.decorator.js';
import { Capability, AccessLevel } from '@agentic/shared';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @RequireCapability(Capability.CONFIGURE_PROJECT, AccessLevel.WRITE)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @RequireCapability(Capability.CONFIGURE_PROJECT, AccessLevel.WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @RequireCapability(Capability.CONFIGURE_PROJECT, AccessLevel.WRITE)
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
