import struct, sys, zlib
from compression import zstd

path, needle = sys.argv[1], sys.argv[2].lower()
out = sys.argv[3] if len(sys.argv) > 3 else None

f = open(path, 'rb')
f.seek(0, 2)
size = f.tell()
tail_len = min(size, 65536 + 22)
f.seek(size - tail_len)
tail = f.read()
eocd = tail.rfind(b'PK\x05\x06')
assert eocd >= 0, 'no EOCD'
cd_size, cd_off = struct.unpack('<II', tail[eocd + 12:eocd + 20])
loc = tail.rfind(b'PK\x06\x07')
if loc >= 0:
    z64_off = struct.unpack('<Q', tail[loc + 8:loc + 16])[0]
    f.seek(z64_off)
    z = f.read(56)
    assert z[:4] == b'PK\x06\x06', 'no zip64 eocd'
    cd_size, cd_off = struct.unpack('<QQ', z[40:56])
print('central dir', cd_off, cd_size, file=sys.stderr)

f.seek(cd_off)
cd = f.read(cd_size)
p = 0
hits = []
while p < len(cd) and cd[p:p + 4] == b'PK\x01\x02':
    (flags, method) = struct.unpack('<HH', cd[p + 8:p + 12])
    csize, usize = struct.unpack('<II', cd[p + 20:p + 28])
    nlen, xlen, clen = struct.unpack('<HHH', cd[p + 28:p + 34])
    loff = struct.unpack('<I', cd[p + 42:p + 46])[0]
    name = cd[p + 46:p + 46 + nlen].decode('utf-8', 'replace')
    extra = cd[p + 46 + nlen:p + 46 + nlen + xlen]
    # zip64 extra
    q = 0
    while q + 4 <= len(extra):
        hid, hlen = struct.unpack('<HH', extra[q:q + 4])
        d = extra[q + 4:q + 4 + hlen]
        if hid == 1:
            vals = []
            r = 0
            if usize == 0xFFFFFFFF: usize = struct.unpack('<Q', d[r:r + 8])[0]; r += 8
            if csize == 0xFFFFFFFF: csize = struct.unpack('<Q', d[r:r + 8])[0]; r += 8
            if loff == 0xFFFFFFFF: loff = struct.unpack('<Q', d[r:r + 8])[0]; r += 8
        q += 4 + hlen
    if needle in name.lower():
        hits.append((name, method, flags, csize, usize, loff, extra))
    p += 46 + nlen + xlen + clen

for h in hits:
    print(h[0], 'method', h[1], 'flags', hex(h[2]), 'csize', h[3], 'usize', h[4], file=sys.stderr)

if out and hits:
    name, method, flags, csize, usize, loff, extra = hits[0]
    f.seek(loff)
    lh = f.read(30)
    assert lh[:4] == b'PK\x03\x04', 'bad local header'
    nlen, xlen = struct.unpack('<HH', lh[26:30])
    f.seek(loff + 30 + nlen + xlen)
    data = f.read(csize)
    if method == 0:
        raw = data
    elif method == 8:
        raw = zlib.decompress(data, -15)
    elif method == 100:
        raw = zstd.decompress(data)
    else:
        sys.exit('unknown method %d' % method)
    open(out, 'wb').write(raw)
    print('wrote', out, len(raw), file=sys.stderr)
