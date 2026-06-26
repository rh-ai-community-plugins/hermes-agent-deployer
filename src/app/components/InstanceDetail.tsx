import React from 'react';
import {
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Button,
  Divider,
  Flex,
  FlexItem,
  Title,
} from '@patternfly/react-core';
import { HermesInstance } from '../types';
import StatusBadge from './StatusBadge';

interface InstanceDetailProps {
  instance: HermesInstance;
  onDelete: (instance: HermesInstance) => void;
  onClose: () => void;
}

const InstanceDetail: React.FC<InstanceDetailProps> = ({ instance, onDelete, onClose }) => (
  <>
    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
      <FlexItem>
        <Title headingLevel="h3">{instance.name}</Title>
      </FlexItem>
      <FlexItem>
        <Button variant="link" onClick={onClose}>Close</Button>
      </FlexItem>
    </Flex>
    <Divider style={{ margin: '16px 0' }} />
    <DescriptionList>
      <DescriptionListGroup>
        <DescriptionListTerm>Status</DescriptionListTerm>
        <DescriptionListDescription><StatusBadge status={instance.status} /></DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Namespace</DescriptionListTerm>
        <DescriptionListDescription>{instance.namespace}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Agent Type</DescriptionListTerm>
        <DescriptionListDescription>{instance.agentType}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Model</DescriptionListTerm>
        <DescriptionListDescription>{instance.config.modelName}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Model URL</DescriptionListTerm>
        <DescriptionListDescription>{instance.config.modelUrl}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>PVC Size</DescriptionListTerm>
        <DescriptionListDescription>{instance.config.pvcSize}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>OAuth Proxy</DescriptionListTerm>
        <DescriptionListDescription>{instance.config.oauthProxyEnabled ? 'Enabled' : 'Disabled'}</DescriptionListDescription>
      </DescriptionListGroup>
      {instance.routeUrl && (
        <DescriptionListGroup>
          <DescriptionListTerm>Route URL</DescriptionListTerm>
          <DescriptionListDescription>
            <a href={instance.routeUrl} target="_blank" rel="noopener noreferrer">{instance.routeUrl}</a>
          </DescriptionListDescription>
        </DescriptionListGroup>
      )}
    </DescriptionList>
    <Divider style={{ margin: '16px 0' }} />
    <Button variant="danger" onClick={() => onDelete(instance)}>Delete Instance</Button>
  </>
);

export default InstanceDetail;
