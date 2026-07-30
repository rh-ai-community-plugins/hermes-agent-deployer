import React from 'react';
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  ActionsColumn,
  IAction,
} from '@patternfly/react-table';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  Button,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import { HermesInstance } from '../types';
import StatusBadge from './StatusBadge';

interface InstanceListProps {
  instances: HermesInstance[];
  onDelete: (instance: HermesInstance) => void;
  onStop: (instance: HermesInstance) => void;
  onStart: (instance: HermesInstance) => void;
  onDeploy: () => void;
  loading: boolean;
}

const InstanceList: React.FC<InstanceListProps> = ({ instances, onDelete, onStop, onStart, onDeploy, loading }) => {
  if (!loading && instances.length === 0) {
    return (
      <EmptyState titleText="No instances deployed" headingLevel="h4" icon={CubesIcon}>
        <EmptyStateBody>
          Click &quot;Deploy New Instance&quot; to get started.
        </EmptyStateBody>
        <EmptyStateFooter>
          <Button variant="primary" onClick={onDeploy}>
            Deploy New Instance
          </Button>
        </EmptyStateFooter>
      </EmptyState>
    );
  }

  const rowActions = (instance: HermesInstance): IAction[] => {
    const isStopped = instance.status === 'Stopped' || instance.status === 'Suspended';
    return [
      {
        title: 'Open',
        onClick: () => {
          if (instance.routeUrl) {
            window.open(instance.routeUrl, '_blank');
          }
        },
        isDisabled: !instance.routeUrl || instance.status !== 'Running',
      },
      { isSeparator: true },
      ...(isStopped
        ? [{ title: 'Start', onClick: () => onStart(instance) }]
        : [{ title: 'Stop', onClick: () => onStop(instance), isDisabled: instance.status === 'Pending' }]),
      {
        title: 'Restart',
        onClick: () => { onStop(instance); setTimeout(() => onStart(instance), 1000); },
        isDisabled: isStopped || instance.status === 'Pending',
      },
      { isSeparator: true },
      {
        title: 'Delete',
        onClick: () => onDelete(instance),
      },
    ];
  };

  return (
    <Table aria-label="Hermes instances">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Namespace</Th>
          <Th>Agent Type</Th>
          <Th>Status</Th>
          <Th>Route URL</Th>
          <Th />
        </Tr>
      </Thead>
      <Tbody>
        {instances.map((inst) => (
          <Tr key={`${inst.namespace}/${inst.name}`}>
            <Td dataLabel="Name">{inst.displayName}</Td>
            <Td dataLabel="Namespace">{inst.namespace}</Td>
            <Td dataLabel="Agent Type">{inst.agentType}</Td>
            <Td dataLabel="Status"><StatusBadge status={inst.status} /></Td>
            <Td dataLabel="Route URL">
              {inst.routeUrl ? (
                <a href={inst.routeUrl} target="_blank" rel="noopener noreferrer">
                  {inst.routeUrl}
                </a>
              ) : (
                '—'
              )}
            </Td>
            <Td isActionCell>
              <ActionsColumn items={rowActions(inst)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default InstanceList;
