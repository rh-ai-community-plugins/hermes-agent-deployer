import React from 'react';
import { Label, Tooltip } from '@patternfly/react-core';
import { InstanceStatus } from '../types';

const statusColor: Record<InstanceStatus, 'green' | 'blue' | 'red' | 'orange' | 'grey'> = {
  Running: 'green',
  Starting: 'blue',
  Error: 'red',
  Terminating: 'orange',
  Unknown: 'grey',
  Pending: 'blue',
};

const statusTooltip: Record<InstanceStatus, string | null> = {
  Running: null,
  Starting: 'Replicas created but service not yet serving traffic',
  Pending: 'Waiting for replica creation',
  Error: 'Deployment has failed readiness checks or hit a resource limit',
  Terminating: 'Resources are being removed (PVC may persist)',
  Unknown: 'Status could not be determined',
};

const StatusBadge: React.FC<{ status: InstanceStatus }> = ({ status }) => {
  const tooltip = statusTooltip[status];
  if (tooltip) {
    return (
      <Tooltip content={tooltip}>
        <Label color={statusColor[status] || 'grey'}>{status}</Label>
      </Tooltip>
    );
  }
  return (
    <Label color={statusColor[status] || 'grey'}>{status}</Label>
  );
};

export default StatusBadge;
