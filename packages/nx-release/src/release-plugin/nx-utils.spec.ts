import { getProjectChangePaths } from './nx-util';
jest.mock('child_process', () => ({
  exec: jest.fn((_c, cb) => cb(null))
}));
jest.mock('fs', () => ({
  readFile: jest.fn((_f, _e, cb) => 
    cb(
      null, 
      Buffer.from(
        JSON.stringify({
          graph: {
            nodes: {
              test: { data: { root: 'libs/test' } },
              dep: { data: { root: 'libs/dep' } }
            },
            dependencies: {
              test: [
                {
                  type: 'static',
                  target: 'dep'
                }
              ]
            }
          }
        }), 
        'utf-8'
      )
    )
  )
}));

describe('getProjectChangePaths', () => {
  
  it('can get paths', async () => {
    const paths = await getProjectChangePaths('test');

    expect(paths.length).toBe(2);
    expect(paths[0]).toBe('libs/test');
    expect(paths[1]).toBe('libs/dep');
  });
});
