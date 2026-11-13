import struct, sys
from xml.sax.saxutils import escape, quoteattr

data = open(sys.argv[1], 'rb').read()
assert data[:8] == b'CryXmlB\0', 'not CryXmlB'
(flen, node_pos, node_cnt, attr_pos, attr_cnt, child_pos, child_cnt,
 str_pos, str_size) = struct.unpack('<9I', data[8:44])

def s(off):
    start = str_pos + off
    end = data.index(b'\0', start)
    return data[start:end].decode('utf-8')

nodes = []
for i in range(node_cnt):
    tag, content, nattr, nchild, parent, fattr, fchild, _ = struct.unpack(
        '<iiHHiiii', data[node_pos + i * 28:node_pos + i * 28 + 28])
    nodes.append((tag, content, nattr, nchild, parent, fattr, fchild))
attrs = [struct.unpack('<ii', data[attr_pos + i * 8:attr_pos + i * 8 + 8]) for i in range(attr_cnt)]
children = [struct.unpack('<i', data[child_pos + i * 4:child_pos + i * 4 + 4])[0] for i in range(child_cnt)]

out = []
def emit(i, depth):
    tag, content, nattr, nchild, parent, fattr, fchild = nodes[i]
    ind = ' ' * depth
    a = ''.join(' %s=%s' % (s(k), quoteattr(s(v))) for k, v in attrs[fattr:fattr + nattr])
    text = s(content)
    if nchild == 0 and not text:
        out.append('%s<%s%s/>' % (ind, s(tag), a))
        return
    out.append('%s<%s%s>%s' % (ind, s(tag), a, escape(text)))
    for c in children[fchild:fchild + nchild]:
        emit(c, depth + 1)
    out.append('%s</%s>' % (ind, s(tag)))

emit(0, 0)
open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print('nodes', node_cnt, 'attrs', attr_cnt)
