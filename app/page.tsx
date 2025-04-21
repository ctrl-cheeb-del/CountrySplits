"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Stripe from "stripe";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import ReactCountryFlag from "react-country-flag";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import ReactECharts from 'echarts-for-react';
import { ThemeToggle } from "@/components/theme-toggle";
import { FiCopy } from "react-icons/fi";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface CountryData {
  code: string;
  count: number;
  percentage: number;
}

const formSchema = z.object({
  apiKey: z.string().min(10, {
    message: "API key must be at least 10 characters.",
  }),
  limit: z.number().min(10).max(10000),
});

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiKey: "",
      limit: 1000,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      setProgress(0);
      setError(null);
      setCountries([]);
      
      const stripe = new Stripe(values.apiKey, { apiVersion: "2025-03-31.basil" });
      
      const counts: Record<string, number> = {};
      let total = 0;
      let processedCount = 0;
      
      let hasMore = true;
      let startingAfter: string | undefined = undefined;
      
      while (hasMore && total < values.limit) {
        const pageSize = Math.min(100, values.limit - total);
        const params: Stripe.CustomerListParams = { 
          limit: pageSize,
        };
        
        if (startingAfter) {
          params.starting_after = startingAfter;
        }
        
        const customers = await stripe.customers.list(params);
        
        if (customers.data.length === 0) {
          hasMore = false;
          continue;
        }
        
        for (const cust of customers.data) {
          if (total >= values.limit) break;
          
          // Read from metadata.country_code first, then address.country, then Unknown
          const countryCode = cust.metadata?.country_code || cust.address?.country || "Unknown";
          
          counts[countryCode] = (counts[countryCode] || 0) + 1;
          total++;
          processedCount++;
          
          // Update progress
          setProgress(Math.floor((total / values.limit) * 100));
        }
        
        if (customers.data.length > 0 && hasMore) {
          startingAfter = customers.data[customers.data.length - 1].id;
        }
        
        // Check if we have more results
        hasMore = customers.has_more && total < values.limit;
      }
      
      const countryData: CountryData[] = Object.entries(counts)
        .map(([code, count]) => ({
          code,
          count,
          percentage: (count / total) * 100,
        }))
        .sort((a, b) => b.count - a.count);
      
      setCountries(countryData);
      setTotalCustomers(total);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const getChartOptions = () => {
    const topCountries = countries.slice(0, 10);
    const isDarkTheme = theme === 'dark';
    
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)',
        backgroundColor: isDarkTheme ? 'rgba(50, 50, 50, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        borderRadius: 8,
        textStyle: {
          color: isDarkTheme ? '#fff' : '#333'
        }
      },
      legend: {
        orient: isMobile ? 'horizontal' : 'vertical',
        ...(isMobile 
          ? { left: 'center', bottom: 10 }
          : { right: 10, top: 'center' }),
        data: topCountries.map(c => c.code),
        textStyle: {
          fontSize: 12,
          color: isDarkTheme ? '#eee' : '#333'
        },
        formatter: (name: string) => {
          const country = topCountries.find(c => c.code === name);
          return `${name} (${country?.percentage.toFixed(1)}%)`;
        }
      },
      series: [
        {
          name: 'Customers by Country',
          type: 'pie',
          radius: isMobile ? ['45%', '65%'] : ['50%', '70%'],
          center: isMobile ? ['50%', '45%'] : ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: isDarkTheme ? '#333' : '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold',
              color: isDarkTheme ? '#fff' : '#333'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          labelLine: {
            show: false
          },
          data: topCountries.map(country => ({
            value: country.count,
            name: country.code
          }))
        }
      ],
      grid: {
        containLabel: true,
        bottom: isMobile ? '18%' : '5%',
        top: '5%',
        left: '5%',
        right: isMobile ? '5%' : '15%'
      }
    };
  };

  const getResultsText = () => {
    if (!countries.length) return "";
    
    let text = `Stripe Customer Country Breakdown (Total: ${totalCustomers})\n\n`;
    countries.forEach(country => {
      text += `${country.code.padEnd(10)} ${country.count.toString().padStart(5)} customers  ${country.percentage.toFixed(2)}%\n`;
    });
    
    return text;
  };
  
  const copyToClipboard = () => {
    const text = getResultsText();
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success("Results copied to clipboard");
      })
      .catch((err) => {
        toast.error("Failed to copy results");
        console.error(err);
      });
  };

  return (
    <div className="min-h-screen p-8 pb-20 bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto"
      >
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Stripe Customer Country Breakdown</CardTitle>
            <CardDescription>
              Enter your Stripe API key to visualize customer distribution by country
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" autoComplete="off">
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stripe API Key</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="sk_live_..." 
                          {...field} 
                          disabled={loading}
                        />
                      </FormControl>
                      <FormDescription>
                        Enter your Stripe API key (not stored on any server)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Limit: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          disabled={loading}
                          min={10}
                          max={10000}
                          step={10}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum number of customers to process
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {loading && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Processing customers...</p>
                    <Progress value={progress} />
                  </div>
                )}
                
                {error && (
                  <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                    <p>{error}</p>
                  </div>
                )}
                
                <Button type="submit" disabled={loading}>
                  {loading ? "Processing..." : "Analyze Customers"}
                </Button>
              </form>
            </Form>
            
            {countries.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-8 space-y-6"
              >
                <div className="p-4 bg-muted rounded-lg">
                  <h3 className="text-lg font-bold mb-2">Total Customers: {totalCustomers}</h3>
                  
                  <div className="h-[350px] sm:h-[400px]">
                    <ReactECharts option={getChartOptions()} style={{ height: '100%' }} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold">Country Breakdown</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      className="flex gap-2 items-center"
                    >
                      <FiCopy className="h-4 w-4" />
                      <span>Copy Results</span>
                    </Button>
                  </div>
                  
                  <div className="space-y-4 sm:space-y-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-2">
                    {countries.map((country, index) => (
                      <motion.div 
                        key={country.code} 
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0 rounded-md sm:rounded-none bg-background sm:bg-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                      >
                        <div className="w-8 h-6 flex items-center justify-start sm:justify-center">
                          {country.code !== "Unknown" ? (
                            <ReactCountryFlag 
                              countryCode={country.code} 
                              svg
                              style={{ width: '1.5em', height: '1.5em' }}
                            />
                          ) : (
                            <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs">?</div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2 w-full">
                          <div className="flex-1 order-2 sm:order-1">
                            <motion.div 
                              className="w-full bg-muted rounded-full h-2 mt-1 overflow-hidden"
                              initial={{ width: 0 }}
                              animate={{ width: "100%" }}
                              transition={{ delay: index * 0.05, duration: 0.5 }}
                            >
                              <motion.div 
                                className="bg-primary h-2 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${country.percentage}%` }}
                                transition={{ delay: index * 0.05 + 0.3, duration: 0.5 }}
                              />
                            </motion.div>
                          </div>
                          <div className="text-sm font-medium order-1 sm:order-2 mt-1 sm:mt-0">{country.code}</div>
                        </div>
                        <div className="text-right w-full sm:w-auto mt-1 sm:mt-0">
                          <div className="text-sm font-medium">{country.count}</div>
                          <div className="text-xs text-muted-foreground">{country.percentage.toFixed(1)}%</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col items-start text-xs text-muted-foreground">
            <p>All data processing happens in your browser. No API keys or customer data are transmitted to any server.</p>
          </CardFooter>
        </Card>
      </motion.div>

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        Sponsored by <a href="https://resold.app" target="_blank" rel="noopener noreferrer" className="underline">Resold</a> and <a href="https://vinta.app" target="_blank" rel="noopener noreferrer" className="underline">Vinta</a>.
      </footer>
    </div>
  );
}
