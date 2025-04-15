import { expect, describe, it, jest, beforeEach } from '@jest/globals';
import { AbstractOperation } from '../AbstractOperation';

type TestEvents = {
  success: { message: string };
  error: { message: string };
  complete: { status: string };
} & Record<string, unknown>;


// Create a concrete implementation for testing
class TestOperation extends AbstractOperation<TestEvents> {
  constructor() {
    super(['success', 'error', 'complete']);
  }

  async execute(data: { succeed?: boolean }): Promise<void> {
    if (data.succeed) {
      this.emitOutput('success', { message: 'Operation succeeded' });
      this.emitOutput('complete', { status: 'done' });
    } else {
      this.emitOutput('error', { message: 'Operation failed' });
    }
  }
}

describe('Operation', () => {
  let operation: TestOperation;

  beforeEach(() => {
    operation = new TestOperation();
  });

  describe('Event handling', () => {
    it('should register and handle events correctly', async () => {
      const successHandler = jest.fn();
      const completeHandler = jest.fn();

      operation.onTyped('success', successHandler);
      operation.onTyped('complete', completeHandler);

      await operation.execute({ succeed: true });

      expect(successHandler).toHaveBeenCalledWith({ message: 'Operation succeeded' });
      expect(completeHandler).toHaveBeenCalledWith({ status: 'done' });
    });

    it('should handle error events', async () => {
      const errorHandler = jest.fn();

      operation.onTyped('error', errorHandler);

      await operation.execute({ succeed: false });

      expect(errorHandler).toHaveBeenCalledWith({ message: 'Operation failed' });
    });

    it('should replace existing event handlers', () => {
      const firstHandler = jest.fn();
      const secondHandler = jest.fn();

      operation.onTyped('success', firstHandler);
      operation.onTyped('success', secondHandler);

      operation.emitTyped('success', { message: 'test' });

      expect(firstHandler).not.toHaveBeenCalled();
      expect(secondHandler).toHaveBeenCalledWith({ message: 'test' });
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid output name', () => {
      expect(() => {
        operation.onTyped('invalid-output', () => {});
      }).toThrow('Invalid output "invalid-output" to operation TestOperation');
    });
  });

  describe('Output creation', () => {
    it('should create outputs object correctly', () => {
      // @ts-ignore Accessing protected property for testing
      const outputs = operation.outputs;

      expect(outputs).toEqual({
        success: 'success',
        error: 'error',
        complete: 'complete'
      });
    });
  });

  describe('Type safety', () => {
    it('should handle typed events correctly', async () => {
      const handler = jest.fn();

      operation.onTyped('success', (data) => {
        handler(data);
      });

      await operation.execute({ succeed: true });

      expect(handler).toHaveBeenCalledWith({ message: 'Operation succeeded' });
    });
  });

  describe('Async execution', () => {
    it('should handle async operations', async () => {
      // Make AsyncEvents satisfy Record<string, unknown> using the same approach
      type AsyncEvents = {
        done: { completed: boolean };
      } & Record<string, unknown>;

      const asyncOperation = new class extends AbstractOperation<AsyncEvents> {
        constructor() {
          super(['done']);
        }

        async execute(): Promise<void> {
          await new Promise(resolve => setTimeout(resolve, 10));
          this.emitOutput('done', { completed: true });
        }
      };

      const handler = jest.fn();
      asyncOperation.onTyped('done', handler);

      await asyncOperation.execute();

      expect(handler).toHaveBeenCalledWith({ completed: true });
    });
  });
});
