import React, { FC } from 'react';
import { GoAButton } from '@abgov/react-components';
import { GoAIconButton, GoAIconType } from '@abgov/react-components/experimental';
import styled from 'styled-components';

interface ContextMenuIconProps {
  type: GoAIconType;
  testId?: string;
  title?: string;
  onClick: () => void;
}

interface ContextMenuTextProps {
  type: GoAIconType;
  testId?: string;
  onClick: () => void;
}

export const GoAContextMenuIcon: FC<ContextMenuIconProps> = (props) => {
  return (
    <GoAIconButton type={props.type} onClick={props.onClick} title={props.title} testId={props.testId} size="medium" />
  );
};

export const GoAContextMenuText: FC<ContextMenuTextProps> = (props) => {
  return <GoAButton buttonType="tertiary" onClick={props.onClick} testId={props.testId} buttonSize={'small'} />;
};

export const GoAContextMenu = styled.div`
  display: flex;
  align-items: center;
  background-color: #fff;
  gap: 0.25rem;

  > .goa-icon-button {
    cursor: pointer;
    border-radius: 0.25rem;
    padding: 0.25rem;
  }
  > .goa-icon-button + .goa-icon-button {
    margin-left: 0rem;
  }
`;
