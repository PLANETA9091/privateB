import com.seedfinding.mcseed.rand.Xoroshiro128PlusPlus;
import java.nio.file.*;
import java.util.*;

public class DungeonCheck {
    static long decorationSeed(long worldSeed, int ox, int oz) {
        Xoroshiro128PlusPlus r = new Xoroshiro128PlusPlus(worldSeed);
        long a = r.nextLong() | 1L;
        long b = r.nextLong() | 1L;
        long n = (long) ox * a + (long) oz * b ^ worldSeed;
        return n;
    }

    static boolean test(long worldSeed, int bx, int by, int bz, int K, int attempts, int bound, int offset, int draws) {
        int ox = (bx >> 4) << 4, oz = (bz >> 4) << 4;
        long deco = decorationSeed(worldSeed, ox, oz);
        Xoroshiro128PlusPlus r = new Xoroshiro128PlusPlus(deco + K);
        for (int i = 0; i < attempts; i++) {
            int x = r.nextInt(16), z = r.nextInt(16), y = r.nextInt(bound) + offset;
            if (x == (bx & 15) && z == (bz & 15) && y == by) return true;
            for (int d = 3; d < draws; d++) r.nextInt(2);
        }
        return false;
    }

    public static void main(String[] args) throws Exception {
        long seed = Long.parseLong(args[0]);
        String json = Files.readString(Path.of(args[1]));
        List<long[]> dungeons = new ArrayList<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\{[^}]*\"x\":\\s*(-?\\d+),\\s*\"y\":\\s*(-?\\d+),\\s*\"z\":\\s*(-?\\d+)").matcher(json);
        while (m.find()) dungeons.add(new long[]{Long.parseLong(m.group(1)), Long.parseLong(m.group(2)), Long.parseLong(m.group(3))});
        System.out.println("dungeons: " + dungeons.size());
        System.out.print("Xoroshiro seed 12345 nextLong: ");
        Xoroshiro128PlusPlus probe = new Xoroshiro128PlusPlus(12345L);
        for (int i = 0; i < 3; i++) System.out.print(probe.nextLong() + " ");
        System.out.println();
        for (int K = 30000; K <= 30010; K++) {
            int normal = 0, deep = 0;
            for (long[] d : dungeons) {
                if (d[1] >= 0) { if (test(seed, (int) d[0], (int) d[1], (int) d[2], K, 10, 320, 0, 5)) normal++; }
                else { if (test(seed, (int) d[0], (int) d[1], (int) d[2], K, 4, 58, -58, 5)) deep++; }
            }
            if (normal + deep > 0) System.out.println("K=" + K + " normal=" + normal + " deep=" + deep);
        }
    }
}
