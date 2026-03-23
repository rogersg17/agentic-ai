import { Module, forwardRef } from '@nestjs/common';
import { ExecutionController } from './execution.controller.js';
import { ExecutionService } from './execution.service.js';
import { ExecutionWorkerService } from './execution-worker.service.js';
import { ArtifactCollectionService } from './artifact-collection.service.js';
import { ExecutionGateway } from './execution.gateway.js';

@Module({
  controllers: [ExecutionController],
  providers: [
    ExecutionService,
    ExecutionWorkerService,
    ArtifactCollectionService,
    ExecutionGateway,
    // Provide by name for forwardRef injection in worker
    { provide: 'ExecutionService', useExisting: ExecutionService },
    { provide: 'ExecutionGateway', useExisting: ExecutionGateway },
  ],
  exports: [ExecutionService, ArtifactCollectionService, ExecutionGateway],
})
export class ExecutionModule {}
