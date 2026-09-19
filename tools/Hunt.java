import com.seedfinding.mcseed.rand.Xoroshiro128PlusPlus;

public class Hunt {
    static long decoSeed(long worldSeed, long ox, long oz) {
        Xoroshiro128PlusPlus r = new Xoroshiro128PlusPlus(worldSeed);
        long a = r.nextLong() | 1L, b = r.nextLong() | 1L;
        return ox * a + oz * b ^ worldSeed;
    }
    public static void main(String[] a) {
        long seed = 8624896123745L;
        long[][] probes = {{-281, -23, -42}, {-234, 10, 214}, {-212, -26, 56}, {-190, 16, 49}};
        int[] bounds = {320, 58, 384, 256, 128, 64};
        int[] offs = {0, -58, -64, 0, 0, 0};
        int hitsTotal = 0;
        for (int originMode = 0; originMode < 2; originMode++) {
            for (int draws = 3; draws <= 5; draws++) {
                for (int yb = 0; yb < bounds.length; yb++) {
                    for (int attempts : new int[]{4, 10, 20}) {
                        for (int K = 0; K <= 60000; K++) {
                            for (long[] p : probes) {
                                int ox = (int) (p[0] >> 4), oz = (int) (p[2] >> 4);
                                long base = originMode == 0 ? ox * 16L : ox;
                                long basez = originMode == 0 ? oz * 16L : oz;
                                Xoroshiro128PlusPlus r = new Xoroshiro128PlusPlus(decoSeed(seed, base, basez) + K);
                                boolean ok = false;
                                for (int i = 0; i < attempts && !ok; i++) {
                                    int x = r.nextInt(16), z = r.nextInt(16), y = r.nextInt(bounds[yb]) + offs[yb];
                                    if (x == (p[0] & 15) && z == (p[2] & 15) && y == p[1]) ok = true;
                                    for (int d = 3; d < draws; d++) r.nextInt(2);
                                }
                                if (ok) {
                                    if (hitsTotal < 25) System.out.println("HIT origin=" + originMode + " draws=" + draws + " yBound=" + bounds[yb] + " off=" + offs[yb] + " attempts=" + attempts + " K=" + K + " probe=" + p[0] + "," + p[1] + "," + p[2]);
                                    hitsTotal++;
                                }
                            }
                        }
                    }
                }
            }
        }
        System.out.println("total hits: " + hitsTotal);
    }
}
