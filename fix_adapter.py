import sys

with open('src/adapter.ts', 'r') as f:
    lines = f.readlines()

out = []
for line in lines:
    if 'export async function buildTree(' in line:
        out.append('export async function buildTree(\n')
        out.append('  blocks: LogseqBlock[],\n')
        out.append('  pageName: string,\n')
        out.append('  showEmpty: boolean,\n')
        out.append('  fetcher: RefFetcher = async () => null,\n')
        out.append('  idResolver: IdResolver = async () => null,\n')
        out.append('  tagProvider?: TagProvider,\n')
        out.append('  pageUuid?: string\n')
        out.append('): Promise<TreeNode> {\n')
    elif 'export async function fetchTree(showEmpty: boolean): Promise<TreeNode | null> {' in line:
        out.append(line)
    elif 'return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty, defaultFetcher, defaultIdResolver);' in line:
        out.append('  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty, defaultFetcher, defaultIdResolver, undefined, (page as any).uuid);\n')
    elif 'return { name: pageName, children, depth: 0, id: nextId++, uuid: "", tags: [], refs: [] };' in line:
        out.append('  const rootTags = pageUuid ? await tagProvider.getTags(pageUuid) : [];\n')
        out.append('  return { name: pageName, children, depth: 0, id: nextId++, uuid: pageUuid || "", tags: [...rootTags], refs: [] };\n')
    else:
        # Skip the original buildTree signature lines until '): Promise<TreeNode> {'
        if '  blocks: LogseqBlock[],' in line or \
           '  pageName: string,' in line or \
           '  showEmpty: boolean,' in line or \
           '  fetcher: RefFetcher = async () => null,' in line or \
           '  idResolver: IdResolver = async () => null,' in line or \
           '  tagProvider?: TagProvider' in line:
             if 'buildTree' in ''.join(out[-5:]):
                 continue
        out.append(line)

with open('src/adapter.ts', 'w') as f:
    f.writelines(out)
