import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'tertiary'],
      description: 'Button variant style',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: 'Button size',
    },
    disabled: {
      control: 'boolean',
      description: 'Is button disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    label: 'Primary Button',
    variant: 'primary',
    size: 'medium',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Secondary Button',
    variant: 'secondary',
    size: 'medium',
  },
};

export const Large: Story = {
  args: {
    label: 'Large Button',
    variant: 'primary',
    size: 'large',
  },
};

export const Small: Story = {
  args: {
    label: 'Small Button',
    variant: 'primary',
    size: 'small',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Button',
    variant: 'primary',
    disabled: true,
  },
};
