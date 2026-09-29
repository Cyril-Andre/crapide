namespace Demo;

public static class Calculator
{
    public static int Abs(int value)
    {
        if (value < 0)
        {
            return -value;
        }

        return value;
    }
}
