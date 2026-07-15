import React from 'react';
import { Label } from '@patternfly/react-core';
import { InstanceStatus } from '../types';

const statusColor: Record<InstanceStatus, 'green' | 'blue' | 'red' | 'orange' | 'grey'> = {
  Running: 'green',
  Starting: 'blue',
  Pending: 'blue',
  Stopped: 'orange',
  Error: 'red',
  Terminating: 'orange',
  Unknown: 'grey',
};

const StatusBadge: React.FC<{ status: InstanceStatus }> = ({ status }) => (
  <Label color={statusColor[status] || 'grey'}>{status}</Label>
);

export default StatusBadge;
